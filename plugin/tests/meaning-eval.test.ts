import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { draftSchema } from "../src/context/claims"
import { registerEvidence, type CitedEvidence } from "../src/context/evidence"
import { createLocalCounter } from "../src/context/local-counter"
import { assertBudget } from "../src/context/token-budget"
import { PROPOSED_LIMITS } from "../src/harness/budget"
import { createOllamaProvider } from "../src/providers/ollama"
import { callStructured } from "../src/providers/structured"
import type { ModelRequest } from "../src/providers/types"
import { structuredRequest } from "../src/workflow/career-graph"
import { meaningPasses, verifyMeaning, type MeaningInput, type StructuredCall } from "../src/workflow/meaning"
import { loadFixtureVault } from "./support/fixture-vault"

interface MeaningCase {
  readonly id: string
  /** dev cases may guide prompt changes; heldout cases only judge them. */
  readonly split: "dev" | "heldout"
  readonly category: string
  /** Whether the workflow should accept the draft. */
  readonly supported: boolean
  /** Vault notes registered as S1, S2, ... in this order. */
  readonly sources: readonly string[]
  readonly claims: ReadonlyArray<{ readonly text: string; readonly evidence: readonly string[] }>
  readonly requiredFacts?: readonly string[]
  readonly original?: string
  readonly style?: string
}

const VAULT = "tests/fixtures/career-vault"
const cases = JSON.parse(readFileSync("tests/fixtures/meaning-cases.json", "utf8")) as MeaningCase[]
const vault = loadFixtureVault(VAULT)

async function inputFor(item: MeaningCase): Promise<MeaningInput> {
  const references = await Promise.all(item.sources.map(async (path) => {
    const text = await vault.readNote(path)
    if (text === null) throw new Error(`Missing fixture note ${path}`)
    return { kind: "vault" as const, path, excerpt: text.replace(/^---\n[\s\S]*?\n---\n/, "").trim() }
  }))
  const evidence: readonly CitedEvidence[] = registerEvidence([], references)
  return {
    draft: draftSchema.parse({ claims: item.claims }),
    evidence,
    requiredFacts: item.requiredFacts ?? [],
    original: item.original ?? null,
    style: item.style ?? null,
  }
}

describe("meaning cases fixture", () => {
  it("is well formed and balanced", async () => {
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length)
    for (const item of cases) {
      const input = await inputFor(item)
      const ids = input.evidence.map((source) => source.sourceId)
      expect(ids, item.id).toHaveLength(item.sources.length)
      for (const claim of item.claims) for (const id of claim.evidence) expect(ids, item.id).toContain(id)
    }
    for (const split of ["dev", "heldout"]) {
      for (const supported of [true, false]) {
        expect(cases.some((item) => item.split === split && item.supported === supported), `${split}/${supported}`).toBe(true)
      }
    }
  })
})

/*
 * Measures the real model's meaning review against labelled drafts. Opt-in: skipped unless
 * FATHOMARK_LIVE_MODEL names an installed Ollama model (e.g. gemma4:e4b).
 *   FATHOMARK_LIVE_OLLAMA  provider URL, default http://127.0.0.1:11434
 *   FATHOMARK_LIVE_REPS    runs per case, default 3 (the model's own sampling varies between runs)
 *   FATHOMARK_LIVE_SEED    optional: fixes temperature 0 and this seed
 *   FATHOMARK_LIVE_SPLIT   optional: dev or heldout only
 * It reports rates and does not gate: there is no agreed pass line for this check yet.
 */
const liveModel = process.env.FATHOMARK_LIVE_MODEL

describe.skipIf(!liveModel)("live meaning review", () => {
  it("reports how often labelled drafts are blocked", async () => {
    const provider = createOllamaProvider(process.env.FATHOMARK_LIVE_OLLAMA ?? "http://127.0.0.1:11434")
    const seed = process.env.FATHOMARK_LIVE_SEED
    const deps = { model: liveModel!, limits: PROPOSED_LIMITS, ...(seed ? { sampling: { temperature: 0, seed: Number(seed) } } : {}) }
    const counter = createLocalCounter()
    const signal = new AbortController().signal
    // Same request and budget check as the workflow's structured step.
    const call: StructuredCall = async (task, data, schema) => {
      const result = await callStructured(provider, structuredRequest(deps, task, data), schema, signal, {
        beforeRequest: async (request: ModelRequest) => { await assertBudget(request, PROPOSED_LIMITS, counter) },
      })
      if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
      return result.value
    }
    const reps = Number(process.env.FATHOMARK_LIVE_REPS ?? 3)
    const selected = cases.filter((item) => !process.env.FATHOMARK_LIVE_SPLIT || item.split === process.env.FATHOMARK_LIVE_SPLIT)

    // B = blocked, P = passed, E = the call failed (parse, provider or budget).
    const marks = new Map<string, string>()
    const started = Date.now()
    for (const item of selected) {
      const input = await inputFor(item)
      let mark = ""
      for (let rep = 0; rep < reps; rep++) {
        try {
          mark += meaningPasses(await verifyMeaning(call, input)) ? "P" : "B"
        } catch (error) {
          mark += "E"
          console.log(`${item.id} error: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
        }
      }
      marks.set(item.id, mark)
    }

    const count = (mark: string, letter: string) => [...mark].filter((value) => value === letter).length
    console.log(`model=${liveModel} reps=${reps} ${seed ? `seed=${seed}` : "sampling=default"} ${((Date.now() - started) / 1000 / Math.max(selected.length * reps, 1)).toFixed(1)}s per call`)
    for (const item of selected) {
      const mark = marks.get(item.id)!
      const right = count(mark, item.supported ? "P" : "B")
      console.log(`${item.id.padEnd(28)} ${item.split.padEnd(7)} ${item.category.padEnd(13)} expect=${item.supported ? "P" : "B"} got=${mark} ${right === reps ? "ok" : "MISS"}`)
    }
    const rate = (items: readonly MeaningCase[], letter: string) => {
      const total = items.length * reps
      const hits = items.reduce((sum, item) => sum + count(marks.get(item.id)!, letter), 0)
      return `${hits}/${total} (${(hits / Math.max(total, 1)).toFixed(2)})`
    }
    for (const split of ["dev", "heldout", "all"]) {
      const scope = selected.filter((item) => split === "all" || item.split === split)
      if (!scope.length) continue
      const bad = scope.filter((item) => !item.supported)
      const good = scope.filter((item) => item.supported)
      console.log(`${split.padEnd(7)} caught=${rate(bad, "B")} wrongly-blocked=${rate(good, "B")} errors=${rate(scope, "E")} unstable=${scope.filter((item) => new Set(marks.get(item.id)).size > 1).length}`)
    }
    for (const category of [...new Set(selected.filter((item) => !item.supported).map((item) => item.category))]) {
      console.log(`  ${category.padEnd(13)} caught=${rate(selected.filter((item) => !item.supported && item.category === category), "B")}`)
    }
    expect(marks.size).toBe(selected.length)
  }, 1_800_000)
})
