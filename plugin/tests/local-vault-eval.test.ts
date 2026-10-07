import { existsSync, readFileSync, writeFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { experienceRuleFor } from "../src/tools/note-kind"
import { createOllamaEmbedder } from "../src/providers/ollama-embedder"
import { createOllamaJudge } from "../src/providers/ollama-judge"
import { type IndexStore, type StoredIndex, VectorIndex } from "../src/retrieval/vector-index"
import { searchHybrid } from "../src/tools/hybrid-search"
import { withoutIndexed, withoutNotes } from "./support/exclude-notes"
import { loadFixtureVault } from "./support/fixture-vault"
import { judge, PASS_LINE, type NoteKind } from "./support/pass-line"
import { reciprocalRank } from "./support/retrieval-metrics"

interface LocalCase {
  readonly id: string
  readonly question: string
  readonly expected: readonly string[]
  readonly shouldAbstain: boolean
  /** Notes hidden from this question's search (the note the question was copied from). */
  readonly exclude?: readonly string[]
}

/*
 * Runs the S2 metrics against a real vault. Opt-in: set both variables, otherwise skipped.
 *   FATHOMARK_LOCAL_VAULT  absolute path of the vault
 *   FATHOMARK_LOCAL_CASES  absolute path of a cases JSON kept OUTSIDE this repo (same shape as career-cases.json)
 *   FATHOMARK_LOCAL_KINDS  absolute path of a JSON map {vault-relative path: "experience"|"study"|"prep"|"other"}, also outside the repo
 *   FATHOMARK_LOCAL_FOLDER optional experience folder(s), comma-separated (the "Experience folder" setting)
 *   FATHOMARK_LOCAL_SEMANTIC  set to 1 to fuse keyword and Ollama embedding search (needs bge-m3 pulled)
 *   FATHOMARK_LOCAL_INDEX  optional path of a JSON file that caches the embedding index between runs, outside the repo
 *   FATHOMARK_LOCAL_JUDGE  optional Ollama chat model (e.g. gemma4:e4b) that judges evidence; needs FATHOMARK_LOCAL_SEMANTIC=1
 * Output is ids, ranks and aggregates only. It never prints note titles, paths or text, so the
 * result can be pasted into chat or docs without leaking the vault.
 */
const vaultRoot = process.env.FATHOMARK_LOCAL_VAULT
const casesPath = process.env.FATHOMARK_LOCAL_CASES
const kindsPath = process.env.FATHOMARK_LOCAL_KINDS
const semanticOn = process.env.FATHOMARK_LOCAL_SEMANTIC === "1"
const indexPath = process.env.FATHOMARK_LOCAL_INDEX

function fileStore(path: string): IndexStore {
  return {
    load: async () => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as StoredIndex) : null),
    save: async (index) => writeFileSync(path, JSON.stringify(index)),
  }
}

describe.skipIf(!vaultRoot || !casesPath || !kindsPath)("local vault evaluation", () => {
  it("reports aggregate metrics without printing note content", async () => {
    const cases = JSON.parse(readFileSync(casesPath!, "utf8")) as LocalCase[]
    const vault = loadFixtureVault(vaultRoot!)
    const rule = experienceRuleFor(process.env.FATHOMARK_LOCAL_FOLDER ?? "")
    const signal = new AbortController().signal
    let semantic
    if (semanticOn) {
      const embedder = createOllamaEmbedder(process.env.FATHOMARK_LOCAL_OLLAMA ?? "http://127.0.0.1:11434")
      const index = new VectorIndex(embedder, indexPath ? fileStore(indexPath) : undefined)
      await index.load()
      const started = Date.now()
      const synced = await index.sync(vault, signal)
      console.log(`index: embedded=${synced.embedded} unchanged=${synced.unchanged} removed=${synced.removed} ${((Date.now() - started) / 1000).toFixed(1)}s`)
      const judgeModel = process.env.FATHOMARK_LOCAL_JUDGE
      semantic = judgeModel
        ? { index, embedder, judge: createOllamaJudge(process.env.FATHOMARK_LOCAL_OLLAMA ?? "http://127.0.0.1:11434", judgeModel) }
        : { index, embedder }
    }
    const rows = []
    const searchStarted = Date.now()
    for (const item of cases) {
      const hidden = new Set((item.exclude ?? []).map((path) => path.normalize("NFC")))
      const { references, supported } = await searchHybrid(
        hidden.size > 0 ? withoutNotes(vault, hidden) : vault,
        item.question,
        10,
        signal,
        rule,
        semantic && hidden.size > 0 ? withoutIndexed(semantic, hidden) : semantic
      )
      const ranked = references.map((reference) => reference.path.normalize("NFC"))
      const expected = item.expected.map((path) => path.normalize("NFC"))
      const firstHit = ranked.findIndex((path) => expected.includes(path))
      rows.push({ id: item.id, ranked, expected, shouldAbstain: item.shouldAbstain, supported, firstHit })
    }

    console.log(`search: ${((Date.now() - searchStarted) / 1000 / Math.max(cases.length, 1)).toFixed(1)}s per question`)
    for (const row of rows) {
      const rank = row.shouldAbstain ? "-" : row.firstHit === -1 ? "miss" : String(row.firstHit + 1)
      console.log(`${row.id.padEnd(14)} supported=${String(row.supported).padEnd(5)} rank=${rank} returned=${row.ranked.length}`)
    }
    const kinds = JSON.parse(readFileSync(kindsPath!, "utf8")) as Record<string, NoteKind>
    const kindOf = (path: string): NoteKind => kinds[path] ?? "other"
    const unlabeled = new Set(rows.flatMap((row) => row.ranked.slice(0, 1)).filter((path) => !(path in kinds)))
    const result = judge(rows.map((row) => ({ ...row, kindOf })))
    const mrr = rows.filter((row) => !row.shouldAbstain).map((row) => reciprocalRank(row.ranked, row.expected))
    const line = (name: string, value: number, bound: string, ok: boolean) =>
      console.log(`${name.padEnd(20)} ${value.toFixed(2)}  (pass ${bound})  ${ok ? "ok" : "FAIL"}`)
    line("recall@3 (any-hit)", result.recall3, `>= ${PASS_LINE.recall3}`, result.recall3 >= PASS_LINE.recall3)
    line("blocked", result.blocked, `>= ${PASS_LINE.blocked}`, result.blocked >= PASS_LINE.blocked)
    line("wrongly blocked", result.wronglyBlocked, `<= ${PASS_LINE.wronglyBlocked}`, result.wronglyBlocked <= PASS_LINE.wronglyBlocked)
    line("non-experience first", result.nonExperienceFirst, `<= ${PASS_LINE.nonExperienceFirst}`, result.nonExperienceFirst <= PASS_LINE.nonExperienceFirst)
    console.log(
      `LOCAL ${result.pass ? "PASS" : "NOT PASS"} MRR=${(mrr.reduce((a, b) => a + b, 0) / Math.max(mrr.length, 1)).toFixed(2)} answerable=${result.answerable} no-evidence=${result.noEvidence} unlabeled-top1=${unlabeled.size}`
    )
    expect(rows.length).toBeGreaterThan(0)
  }, 1_800_000)
})
