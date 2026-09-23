import { describe, expect, it } from "vitest"

import { type EvidenceReference, dedupe, referenceKey } from "../src/context/evidence"

const note: EvidenceReference = {
  kind: "vault",
  path: "Projects/Fathomark.md",
  heading: "Scope",
  excerpt: "one",
}

describe("evidence references", () => {
  it("collapses two retrievals of the same note location, keeping the first", () => {
    const again: EvidenceReference = { ...note, excerpt: "two" }
    const result = dedupe([note, again])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ excerpt: "one" })
  })

  it("keeps vault and external evidence apart even when they describe the same topic", () => {
    const external: EvidenceReference = {
      kind: "external",
      source: "wikipedia",
      title: "Fathom",
      url: "https://en.wikipedia.org/wiki/Fathom",
      excerpt: "a unit of length",
    }
    expect(referenceKey(note)).not.toBe(referenceKey(external))
    expect(dedupe([note, external])).toHaveLength(2)
  })

  it("distinguishes two headings within one note", () => {
    const other: EvidenceReference = { ...note, heading: "Non-goals" }
    expect(dedupe([note, other])).toHaveLength(2)
  })
})
