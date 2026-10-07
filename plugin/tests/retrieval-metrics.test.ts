import { describe, expect, it } from "vitest"

import { abstentionRate, recallAtK, reciprocalRank } from "./support/retrieval-metrics"

describe("recallAtK", () => {
  it("is 1 when every expected path is within the top k", () => {
    expect(recallAtK(["a", "b", "c"], ["a", "c"], 3)).toBe(1)
  })

  it("counts only expected paths ranked inside k", () => {
    expect(recallAtK(["x", "y", "a", "c"], ["a", "c"], 3)).toBe(0.5)
  })

  it("is 0 when nothing expected is retrieved", () => {
    expect(recallAtK(["x", "y"], ["a"], 5)).toBe(0)
  })

  it("is undefined-safe: no expected paths means nothing to recall, so 1", () => {
    expect(recallAtK(["x"], [], 3)).toBe(1)
  })
})

describe("reciprocalRank", () => {
  it("is 1 for a first-place hit", () => {
    expect(reciprocalRank(["a", "b"], ["a"])).toBe(1)
  })

  it("is 1 / rank of the first expected path", () => {
    expect(reciprocalRank(["x", "y", "a"], ["a", "b"])).toBeCloseTo(1 / 3)
  })

  it("is 0 when no expected path appears", () => {
    expect(reciprocalRank(["x"], ["a"])).toBe(0)
  })
})

describe("abstentionRate", () => {
  it("is the share of should-abstain cases that were reported unsupported", () => {
    expect(
      abstentionRate([
        { supported: false, shouldAbstain: true },
        { supported: true, shouldAbstain: true },
        { supported: true, shouldAbstain: false },
      ])
    ).toBe(0.5)
  })

  it("is 1 when no case should abstain", () => {
    expect(abstentionRate([{ supported: true, shouldAbstain: false }])).toBe(1)
  })
})
