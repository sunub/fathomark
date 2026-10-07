import { describe, expect, it } from "vitest"

import { type JudgedCase, judge, type NoteKind } from "./support/pass-line"

const kindOf = (path: string): NoteKind => (path.startsWith("exp/") ? "experience" : "study")

const answerable = (overrides: Partial<JudgedCase> = {}): JudgedCase => ({
  shouldAbstain: false,
  expected: ["exp/a.md"],
  ranked: ["exp/a.md"],
  supported: true,
  kindOf,
  ...overrides,
})
const noEvidence = (supported: boolean): JudgedCase => ({
  shouldAbstain: true,
  expected: [],
  ranked: [],
  supported,
  kindOf,
})

describe("judge", () => {
  it("passes when every metric is within its line", () => {
    const result = judge([answerable(), answerable(), noEvidence(false)])
    expect(result).toMatchObject({ recall3: 1, blocked: 1, wronglyBlocked: 0, nonExperienceFirst: 0, pass: true })
  })

  it("counts a hit when any expected note is in the top 3, not only the first", () => {
    const hit = answerable({ expected: ["exp/a.md", "exp/b.md"], ranked: ["study/x.md", "study/y.md", "exp/b.md"] })
    const miss = answerable({ ranked: ["study/x.md", "study/y.md", "study/z.md", "exp/a.md"] })
    expect(judge([hit, miss]).recall3).toBe(0.5)
  })

  it("measures blocking on no-evidence questions only", () => {
    const result = judge([answerable(), noEvidence(true), noEvidence(false)])
    expect(result.blocked).toBe(0.5)
    expect(result.pass).toBe(false)
  })

  it("measures wrong blocking on answerable questions only", () => {
    const result = judge([answerable({ supported: false }), answerable(), noEvidence(false)])
    expect(result.wronglyBlocked).toBe(0.5)
  })

  it("counts a non-experience top note, ignoring questions with no results", () => {
    const opinionFirst = answerable({ ranked: ["study/x.md", "exp/a.md"] })
    const empty = answerable({ ranked: [], supported: false })
    const result = judge([opinionFirst, answerable(), empty])
    expect(result.nonExperienceFirst).toBe(0.5)
  })

  it("treats a missing no-evidence set as fully blocked", () => {
    expect(judge([answerable()]).blocked).toBe(1)
  })
})
