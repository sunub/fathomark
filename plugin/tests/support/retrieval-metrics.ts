/*
 * Retrieval metrics for the career-writing evaluation (plan S1).
 * Pure functions over ranked note paths, so any retriever can be scored.
 */

export function recallAtK(ranked: readonly string[], expected: readonly string[], k: number): number {
  if (expected.length === 0) return 1
  const top = new Set(ranked.slice(0, k))
  return expected.filter((path) => top.has(path)).length / expected.length
}

export function reciprocalRank(ranked: readonly string[], expected: readonly string[]): number {
  const index = ranked.findIndex((path) => expected.includes(path))
  return index === -1 ? 0 : 1 / (index + 1)
}

export interface AbstentionCase {
  readonly supported: boolean
  readonly shouldAbstain: boolean
}

/** Share of should-abstain cases the retriever reported as unsupported. */
export function abstentionRate(results: readonly AbstentionCase[]): number {
  const mustAbstain = results.filter((item) => item.shouldAbstain)
  if (mustAbstain.length === 0) return 1
  return mustAbstain.filter((item) => !item.supported).length / mustAbstain.length
}
