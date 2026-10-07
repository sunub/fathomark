import { describe, expect, it } from "vitest"

import { chunkNote } from "../src/retrieval/chunk"

describe("chunkNote", () => {
  it("packs short paragraphs into one chunk and splits at about 600 characters", () => {
    const paragraph = "가 ".repeat(125).trim()
    const chunks = chunkNote([paragraph, paragraph, paragraph].join("\n\n"))
    expect(chunks.map((chunk) => chunk.text.length)).toEqual([499, 249])
  })

  it("drops embedded images and other unbroken runs", () => {
    const chunks = chunkNote(`본문입니다.\n\n![[a.png]] data:image/png;base64,${"A".repeat(400)}\n\n다음 문단`)
    expect(chunks.map((chunk) => chunk.text).join("\n")).not.toContain("AAAA")
    expect(chunks[0]?.text).toContain("본문입니다.")
  })

  it("keeps the frontmatter in the first chunk", () => {
    const chunks = chunkNote("---\ntype: experience\n---\n본문")
    expect(chunks[0]?.text.startsWith("---\ntype: experience")).toBe(true)
  })

  it("cuts a single oversized paragraph", () => {
    expect(chunkNote(Array.from({ length: 50 }, () => "나 ".repeat(50)).join("\n"))[0]?.text.length).toBe(1_000)
  })

  it("returns nothing for an empty note", () => {
    expect(chunkNote("  \n\n ")).toEqual([])
  })
})
