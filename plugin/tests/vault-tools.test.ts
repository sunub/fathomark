import { describe, expect, it, vi } from "vitest"

import type { NoteSummary } from "../src/obsidian/vault-adapter"
import type { ToolExecutionContext } from "../src/tools/registry"
import { ToolRegistry } from "../src/tools/registry"
import { type VaultReader, registerVaultTools } from "../src/tools/vault-tools"

function context(signal = new AbortController().signal): ToolExecutionContext {
  return {
    signal,
    researchTopic: null,
    allowedWikipediaPages: new Set(),
    permissions: () => ({ networkResearchEnabled: false }),
    onResearchQuery: () => {},
  }
}

function registry(reader: VaultReader): ToolRegistry {
  const result = new ToolRegistry()
  registerVaultTools(result, reader)
  return result
}

describe("vault tools", () => {
  it.each(["../secret.md", "/absolute.md", "C:\\secret.md", "image.png"])(
    "rejects unsafe or attachment path %s",
    (path) => {
      const tool = registry({ listNotes: () => [], readNote: async () => null }).get("read_note")
      expect(tool?.input.safeParse({ path }).success).toBe(false)
    }
  )

  it("returns a structured failure for a missing note", async () => {
    const tool = registry({ listNotes: () => [], readNote: async () => null }).get("read_note")!
    const output = await tool.run({ path: "Missing.md" } as never, context())

    expect(output).toMatchObject({
      references: [],
      error: { code: "not_found", message: "Missing.md was not found." },
    })
  })

  it("ranks title matches first, breaks ties by path, and caps results at ten", async () => {
    const notes: NoteSummary[] = [
      { path: "z-body.md", title: "Other" },
      { path: "b-title.md", title: "Project Alpha" },
      { path: "a-title.md", title: "Alpha Notes" },
      ...Array.from({ length: 12 }, (_, index) => ({
        path: `extra-${String(index).padStart(2, "0")}.md`,
        title: "Other",
      })),
    ]
    const reader: VaultReader = {
      listNotes: () => notes,
      readNote: async (path) => (path === "z-body.md" ? "alpha in body" : "alpha paragraph"),
    }
    const tool = registry(reader).get("search_vault")!

    const output = (await tool.run({ query: "Alpha", limit: 10 } as never, context())) as {
      references: Array<{ path: string }>
    }

    expect(output.references).toHaveLength(10)
    expect(output.references.slice(0, 2).map((reference) => reference.path)).toEqual([
      "a-title.md",
      "b-title.md",
    ])
  })

  it("does not cut a paragraph that exceeds 4096 UTF-8 bytes", async () => {
    const reader: VaultReader = {
      listNotes: () => [{ path: "Long.md", title: "Long" }],
      readNote: async () => `키워드 ${"한".repeat(1_400)}`,
    }
    const tool = registry(reader).get("search_vault")!

    const output = (await tool.run({ query: "키워드" } as never, context())) as {
      references: unknown[]
      omitted: string[]
    }

    expect(output.references).toEqual([])
    expect(output.omitted).toContain("Long.md: matching paragraph exceeds 4096 UTF-8 bytes")
  })

  it("normalizes duplicate heading references", async () => {
    const reader: VaultReader = {
      listNotes: () => [{ path: "Note.md", title: "Note" }],
      readNote: async () => "# Intro\n\nkeyword first\n\n# Intro\n\nkeyword second",
    }
    const tool = registry(reader).get("search_vault")!

    const output = (await tool.run({ query: "keyword" } as never, context())) as {
      references: Array<{ path: string; heading?: string }>
    }

    expect(output.references).toEqual([
      expect.objectContaining({ path: "Note.md", heading: "Intro" }),
    ])
  })

  it("starts no additional reads after cancellation", async () => {
    const controller = new AbortController()
    const readNote = vi.fn(async () => {
      controller.abort(new DOMException("stop", "AbortError"))
      return "keyword"
    })
    const reader: VaultReader = {
      listNotes: () =>
        Array.from({ length: 20 }, (_, index) => ({ path: `${index}.md`, title: String(index) })),
      readNote,
    }
    const tool = registry(reader).get("search_vault")!

    await expect(tool.run({ query: "keyword" } as never, context(controller.signal))).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(readNote).toHaveBeenCalledTimes(1)
  })
})
