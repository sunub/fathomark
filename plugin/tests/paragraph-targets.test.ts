import { describe, expect, it } from "vitest"

import type { CurrentNoteContext } from "../src/context/packet"
import { paragraphCandidates, resolveParagraphTarget, targetFromCandidate } from "../src/workflow/targets"

function note(text: string): CurrentNoteContext {
  return { path: "career.md", title: "경험", text, isSelection: false }
}

describe("paragraphCandidates", () => {
  it("retains exact CRLF, whitespace, full document and absolute positions", () => {
    const source = note("# 경험\r\n\r\n 첫 줄  \r\n둘째 줄\r\n \r\n마지막")
    const candidates = paragraphCandidates(source)
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({
      text: " 첫 줄  \r\n둘째 줄", from: { line: 2, ch: 0 }, to: { line: 3, ch: 4 },
      documentText: source.text,
    })
    const target = targetFromCandidate(candidates[0]!)
    expect(target.text).toBe(source.text)
    expect(target.selection).toBe(" 첫 줄  \r\n둘째 줄")
    expect(resolveParagraphTarget(candidates, target.id)).toEqual(target)
    expect(resolveParagraphTarget(candidates, "invented-id")).toBeNull()
  })

  it("excludes frontmatter, headings and fenced code from editable candidates", () => {
    const source = note("---\nauthor: me\n---\n# Title\n첫 문단\n```ts\nsecret()\n```\n둘째 문단\n~~~\ncode\n~~~\n")
    expect(paragraphCandidates(source).map((candidate) => candidate.text)).toEqual(["첫 문단", "둘째 문단"])
  })

  it("does not mistake a shorter or annotated fence for the closing fence", () => {
    const source = note("````\n```\n````ts\nhidden\n````\nshown")
    expect(paragraphCandidates(source).map((candidate) => candidate.text)).toEqual(["shown"])
  })

  it("skips oversized paragraphs rather than producing truncated replacement targets", () => {
    const source = note(`${"a".repeat(2_001)}\n\n${"b".repeat(2_000)}`)
    expect(paragraphCandidates(source).map((candidate) => candidate.text)).toEqual(["b".repeat(2_000)])
  })

  it("limits candidates to 40 and preserves stable IDs for the same snapshot", () => {
    const source = note(Array.from({ length: 45 }, (_, index) => `paragraph ${index}`).join("\n\n"))
    expect(paragraphCandidates(source)).toHaveLength(40)
    expect(paragraphCandidates(source)).toEqual(paragraphCandidates(source))
  })

  it("does not invent absolute positions for selection-only context", () => {
    expect(paragraphCandidates(null)).toEqual([])
    expect(paragraphCandidates({ ...note("selected"), isSelection: true })).toEqual([])
    expect(paragraphCandidates(note(""))).toEqual([])
  })
})
