import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { createLocalCounter } from "../src/context/local-counter"
import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunId } from "../src/harness/events"
import type { RunInput } from "../src/harness/run-input"
import { createOllamaProvider } from "../src/providers/ollama"
import { createToolRegistry } from "../src/tools/create-registry"
import { runCareerWorkflow } from "../src/workflow/career-graph"
import { loadFixtureVault } from "./support/fixture-vault"

interface FlowCase {
  readonly id: string
  readonly question: string
  /** Any of these notes answers the question. Empty when the vault has no such experience. */
  readonly expected: readonly string[]
  readonly shouldAbstain: boolean
}

interface FlowResult {
  readonly id: string
  readonly split: string
  readonly shouldAbstain: boolean
  readonly outcome: string
  /** An expected note entered the run's evidence. */
  readonly found: boolean
  /** The verified draft cites an expected note. */
  readonly cited: boolean
  readonly questions: number
  readonly modelCalls: number
  readonly seconds: number
  readonly reason: string
}

/*
 * Runs the whole career workflow against a real model on the fixture vault. Opt-in: skipped unless
 * FATHOMARK_LIVE_MODEL names an installed Ollama model (e.g. gemma4:e4b).
 *   FATHOMARK_LIVE_OLLAMA  provider URL, default http://127.0.0.1:11434
 *   FATHOMARK_LIVE_REPS    runs per case, default 1
 *   FATHOMARK_LIVE_SPLIT   optional: dev (career-cases.json) or heldout (career-cases-heldout.json)
 *   FATHOMARK_LIVE_FOLDER  experience folder setting, default 경험
 * The simulated user knows nothing beyond the vault, so a question can only end a run as incomplete.
 * It reports rates and does not gate: there is no agreed pass line for the whole flow yet.
 */
const liveModel = process.env.FATHOMARK_LIVE_MODEL
const SPLITS = { dev: "tests/fixtures/career-cases.json", heldout: "tests/fixtures/career-cases-heldout.json" } as const
const UNKNOWN_ANSWER = "기록에 있는 내용 외에는 확인해 드릴 수 없습니다."

describe.skipIf(!liveModel)("live career workflow", () => {
  it("reports how often the flow finds, cites and abstains", async () => {
    const vault = loadFixtureVault("tests/fixtures/career-vault")
    const base = process.env.FATHOMARK_LIVE_OLLAMA ?? "http://127.0.0.1:11434"
    const reps = Number(process.env.FATHOMARK_LIVE_REPS ?? 1)
    const splits = Object.entries(SPLITS).filter(([split]) => !process.env.FATHOMARK_LIVE_SPLIT || split === process.env.FATHOMARK_LIVE_SPLIT)
    const results: FlowResult[] = []

    for (const [split, path] of splits) {
      const cases = JSON.parse(readFileSync(path, "utf8")) as FlowCase[]
      for (const item of cases) {
        for (let rep = 0; rep < reps; rep++) {
          const provider = createOllamaProvider(base)
          let modelCalls = 0
          let questions = 0
          const counted = { ...provider, stream: (request: Parameters<typeof provider.stream>[0], signal: AbortSignal) => { modelCalls++; return provider.stream(request, signal) } }
          const input: RunInput = {
            question: `다음 문항에 답하는 자기소개서 초안을 500자 내외로 써줘. 문항: ${item.question}`,
            mode: "career",
            packet: { systemInstructions: "", currentNote: null, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] },
          }
          const sources = new Map<string, string>()
          let outcome = "none"
          let reason = ""
          let draft = ""
          const started = Date.now()
          for await (const event of runCareerWorkflow(`${item.id}-${rep}` as RunId, input, {
            provider: counted,
            model: liveModel!,
            tools: createToolRegistry({ vault, experienceFolder: () => process.env.FATHOMARK_LIVE_FOLDER ?? "경험", includeQuestions: true }),
            limits: PROPOSED_LIMITS,
            counter: createLocalCounter(),
            permissions: () => ({ networkResearchEnabled: false }),
            waitForUser: async () => { questions++; return { questionId: `q${questions}`, answerId: `a${questions}`, answer: UNKNOWN_ANSWER } },
          }, new AbortController().signal)) {
            if (event.type === "evidence" && event.reference.kind === "vault") sources.set(event.sourceId, event.reference.path.normalize("NFC"))
            if (event.type === "verified_draft") draft = event.text
            if (event.type === "workflow_incomplete") reason = event.message
            if (event.type === "run_completed") outcome = event.outcome
          }
          const expected = item.expected.map((note) => note.normalize("NFC"))
          const cited = [...draft.matchAll(/\[\[(S\d+)\]\]/g)].map((match) => sources.get(match[1]!))
          results.push({
            id: item.id,
            split,
            shouldAbstain: item.shouldAbstain,
            outcome,
            found: [...sources.values()].some((note) => expected.includes(note)),
            cited: cited.some((note) => note !== undefined && expected.includes(note)),
            questions,
            modelCalls,
            seconds: (Date.now() - started) / 1000,
            reason: reason.split("\n")[0]!.slice(0, 70),
          })
        }
      }
    }

    console.log(`model=${liveModel} reps=${reps}`)
    for (const row of results) {
      console.log(`${row.id.padEnd(12)} ${row.split.padEnd(7)} ${row.shouldAbstain ? "abstain" : "answer "} ${row.outcome.padEnd(10)} found=${row.found ? "y" : "n"} cited=${row.cited ? "y" : "n"} q=${row.questions} calls=${String(row.modelCalls).padStart(2)} ${row.seconds.toFixed(0).padStart(3)}s ${row.reason}`)
    }
    const share = (rows: readonly FlowResult[], test: (row: FlowResult) => boolean) =>
      `${rows.filter(test).length}/${rows.length} (${(rows.filter(test).length / Math.max(rows.length, 1)).toFixed(2)})`
    for (const split of [...splits.map(([name]) => name), "all"]) {
      const scope = results.filter((row) => split === "all" || row.split === split)
      const answerable = scope.filter((row) => !row.shouldAbstain)
      const noEvidence = scope.filter((row) => row.shouldAbstain)
      const mean = (pick: (row: FlowResult) => number) => (scope.reduce((sum, row) => sum + pick(row), 0) / Math.max(scope.length, 1)).toFixed(1)
      console.log(`${split.padEnd(7)} found=${share(answerable, (row) => row.found)} completed=${share(answerable, (row) => row.outcome === "complete")} cited=${share(answerable, (row) => row.cited)} abstained=${share(noEvidence, (row) => row.outcome !== "complete")} failed=${share(scope, (row) => row.outcome === "failed")} questions=${mean((row) => row.questions)} calls=${mean((row) => row.modelCalls)} seconds=${mean((row) => row.seconds)}`)
    }
    expect(results.length).toBeGreaterThan(0)
  }, 3_600_000)
})
