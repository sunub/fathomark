import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { searchVault } from "../src/tools/vault-search"
import { loadFixtureVault } from "./support/fixture-vault"
import { abstentionRate, recallAtK, reciprocalRank } from "./support/retrieval-metrics"

interface CareerCase {
  readonly id: string
  readonly question: string
  readonly expected: readonly string[]
  readonly shouldAbstain: boolean
}

const root = resolve(import.meta.dirname, "fixtures/career-vault")
const cases = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "fixtures/career-cases.json"), "utf8")
) as CareerCase[]

/*
 * Baseline for plan S1: the lexical search as it is today. Thresholds are not
 * asserted yet; the printed numbers are recorded in docs/testing/career-retrieval-baseline.md
 * and later slices (S2) are compared against them. The sample is small, so the
 * numbers show direction, not significance.
 */
describe("career retrieval baseline (lexical searchVault)", () => {
  it("scores every case and reports aggregate metrics", async () => {
    const vault = loadFixtureVault(root)
    const signal = new AbortController().signal
    const rows = []
    for (const item of cases) {
      const { references, supported } = await searchVault(vault, item.question, 10, signal)
      const ranked = references.map((reference) => reference.path)
      rows.push({
        id: item.id,
        ranked,
        expected: item.expected,
        shouldAbstain: item.shouldAbstain,
        supported,
      })
    }

    const answerable = rows.filter((row) => !row.shouldAbstain)
    const recall3 = mean(answerable.map((row) => recallAtK(row.ranked, row.expected, 3)))
    const mrr = mean(answerable.map((row) => reciprocalRank(row.ranked, row.expected)))
    const abstention = abstentionRate(rows)

    for (const row of rows) {
      console.log(
        `${row.id.padEnd(11)} supported=${String(row.supported).padEnd(5)} top3=${JSON.stringify(row.ranked.slice(0, 3))} expected=${JSON.stringify(row.expected)}`
      )
    }
    console.log(
      `BASELINE recall@3=${recall3.toFixed(2)} MRR=${mrr.toFixed(2)} abstention=${abstention.toFixed(2)} (answerable=${answerable.length}, should-abstain=${rows.length - answerable.length})`
    )

    for (const value of [recall3, mrr, abstention]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}
