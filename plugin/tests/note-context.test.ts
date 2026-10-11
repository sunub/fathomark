import { describe, expect, it } from "vitest"

import { registerNoteContextTool } from "../src/tools/note-context"
import type { ToolExecutionContext } from "../src/tools/registry"
import { ToolRegistry } from "../src/tools/registry"
import type { VaultReader } from "../src/tools/vault-search"

const context: ToolExecutionContext = {
  signal: new AbortController().signal,
  researchTopic: null,
  allowedWikipediaPages: new Set(),
  permissions: () => ({ networkResearchEnabled: false }),
  onResearchQuery: () => {},
}

function tool(files: Record<string, string>) {
  const vault: VaultReader = {
    listNotes: () =>
      Object.keys(files).map((path) => ({ path, title: path.split("/").pop()!.replace(/\.md$/, "") })),
    readNote: async (path) => files[path] ?? null,
  }
  const registry = new ToolRegistry()
  registerNoteContextTool(registry, vault)
  return registry.get("get_note_context")!
}

/** Parses first, as `executeTool` does, so schema defaults apply. */
const run = (t: ReturnType<typeof tool>, input: object) =>
  t.run(t.input.parse(input) as never, context) as Promise<any>

describe("get_note_context", () => {
  it("lists headings outside code fences and resolves links by title, path and alias", async () => {
    const t = tool({
      "Projects/Alpha.md": [
        "# Alpha",
        "```",
        "# not a heading",
        "```",
        "## Retro",
        "See [[Retro Notes|the retro]], [[Journal/2026-01#Day]] and ![[diagram.png]].",
      ].join("\n"),
      "Retro Notes.md": "x",
      "Journal/2026-01.md": "y",
    })
    const out = await run(t, { path: "Projects/Alpha.md" })

    expect(out.headings).toEqual([
      { level: 1, text: "Alpha" },
      { level: 2, text: "Retro" },
    ])
    expect(out.links).toEqual([
      { status: "resolved", target: "Retro Notes", path: "Retro Notes.md", title: "Retro Notes" },
      { status: "resolved", target: "Journal/2026-01", path: "Journal/2026-01.md", title: "2026-01" },
    ])
    expect(t.output.safeParse(out).success).toBe(true)
  })

  it("separates a broken link, a missing note and a note with no links", async () => {
    const t = tool({ "A.md": "[[Ghost]]", "B.md": "plain" })

    expect((await run(t, { path: "A.md" })).links).toEqual([{ status: "broken", target: "Ghost" }])
    expect(await run(t, { path: "B.md" })).toMatchObject({ links: [], omitted: [] })
    expect(await run(t, { path: "C.md" })).toMatchObject({ error: { code: "not_found" } })
  })

  it("returns only the requested sections", async () => {
    const t = tool({ "A.md": "# Title\n[[B]]", "B.md": "" })

    const headingsOnly = await run(t, { path: "A.md", include: ["headings"] })
    expect(headingsOnly.headings).toEqual([{ level: 1, text: "Title" }])
    expect("links" in headingsOnly).toBe(false)

    const linksOnly = await run(t, { path: "A.md", include: ["links"] })
    expect(linksOnly.links).toHaveLength(1)
    expect("headings" in linksOnly).toBe(false)
    expect(t.output.safeParse(linksOnly).success).toBe(true)
  })

  it("reports an unreadable note apart from a missing one, but lets a cancel through", async () => {
    const failing: VaultReader = {
      listNotes: () => [],
      readNote: async () => {
        throw new Error("EACCES")
      },
    }
    const registry = new ToolRegistry()
    registerNoteContextTool(registry, failing)
    const t = registry.get("get_note_context")!

    const out = await run(t, { path: "A.md" })
    expect(out.error).toEqual({ code: "unreadable", message: "A.md could not be read." })
    expect(JSON.stringify(out)).not.toContain("EACCES")

    const controller = new AbortController()
    const aborting: VaultReader = {
      listNotes: () => [],
      readNote: async () => {
        controller.abort()
        throw new Error("aborted read")
      },
    }
    const abortRegistry = new ToolRegistry()
    registerNoteContextTool(abortRegistry, aborting)
    await expect(
      abortRegistry.get("get_note_context")!.run({ path: "A.md", include: ["links"], limit: 10 } as never, {
        ...context,
        signal: controller.signal,
      })
    ).rejects.toThrow()
  })

  it("does not loop on cycles, repeats or self-links, and caps the list", async () => {
    const t = tool({ "A.md": "[[B]] [[b]] [[A]] [[C]] [[D]]", "B.md": "[[A]]", "C.md": "", "D.md": "" })
    const out = await run(t, { path: "A.md", limit: 2 })

    expect(out.links.map((l: { path: string }) => l.path)).toEqual(["B.md", "C.md"])
    expect(out.omitted).toHaveLength(1)
  })

  it.each(["../x.md", "/x.md", "x.png"])("rejects unsafe path %s", (path) => {
    expect(tool({}).input.safeParse({ path }).success).toBe(false)
  })

  it.each([[[]], [["body"]], [["headings", "links", "links"]]])("rejects include %j", (include) => {
    expect(tool({}).input.safeParse({ path: "A.md", include }).success).toBe(false)
  })
})
