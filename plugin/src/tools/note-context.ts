/*
 * get_note_context — docs/design/workflow/tools/get-note-context.md.
 *
 * Returns a note's heading outline and the notes it links to, so the model can
 * decide which one to read next. A link is a lead, not evidence: this tool
 * returns no references, and a claim still needs the text from read_note.
 *
 * Only the note's own outgoing links are followed, one level deep. Nothing is
 * traversed further, so a cycle of links cannot grow the number of reads.
 */

import { z } from "zod"

import { safeMarkdownPath } from "./read-note"
import type { ToolRegistry } from "./registry"
import type { VaultReader } from "./vault-search"

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/
const FENCE = /^\s*(```|~~~)/
/** Wikilinks only. `![[embed]]` is an attachment or transclusion, not a related note. */
const WIKILINK = /(?<!!)\[\[([^\][|#]+)(?:#[^\][|]*)?(?:\|[^\][]*)?\]\]/g

const SECTIONS = ["headings", "links"] as const

const contextInput = z
  .object({
    path: safeMarkdownPath,
    /** Which parts to return. Omitted means both. */
    include: z.array(z.enum(SECTIONS)).min(1).max(SECTIONS.length).default([...SECTIONS]),
    /** Caps the links list; it has no effect when links are not requested. */
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict()

const outputSchema = z.object({
  path: z.string(),
  /** Present only when requested. An empty list means the note has no headings. */
  headings: z.array(z.object({ level: z.number().int().min(1).max(6), text: z.string() })).optional(),
  /** Present only when requested. An empty list means the note has no links. */
  links: z
    .array(
      z.discriminatedUnion("status", [
        z.object({ status: z.literal("resolved"), target: z.string(), path: z.string(), title: z.string() }),
        z.object({ status: z.literal("broken"), target: z.string() }),
      ])
    )
    .optional(),
  omitted: z.array(z.string()),
  /** `not_found`: no such note. `unreadable`: the note exists but could not be read. */
  error: z.object({ code: z.enum(["not_found", "unreadable"]), message: z.string() }).optional(),
})

export type NoteContextOutput = z.infer<typeof outputSchema>

export function outlineOf(content: string): NonNullable<NoteContextOutput["headings"]> {
  const headings: NonNullable<NoteContextOutput["headings"]> = []
  let fenced = false
  for (const line of content.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    const match = fenced ? null : HEADING_LINE.exec(line)
    if (match?.[1] && match[2]) headings.push({ level: match[1].length, text: match[2] })
  }
  return headings
}

export function registerNoteContextTool(registry: ToolRegistry, vault: VaultReader): void {
  registry.register({
    name: "get_note_context",
    description:
      "List a note's headings and the notes it links to, to find which related note to read next. " +
      "A link only points to a candidate; it is not evidence of what the user did.",
    input: contextInput,
    output: outputSchema,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          pattern:
            "^(?!/)(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+\\.[mM][dD]$",
        },
        include: {
          type: "array",
          items: { type: "string", enum: [...SECTIONS] },
          minItems: 1,
          maxItems: SECTIONS.length,
          default: [...SECTIONS],
        },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
      },
      required: ["path"],
      additionalProperties: false,
    },
    capability: "read_note",
    approval: "never",
    timeoutMs: 10_000,
    resultBudgetTokens: 800,
    provenance: () => [],
    run: async ({ path, include, limit }, context) => {
      context.signal.throwIfAborted()
      let content: string | null
      try {
        content = await vault.readNote(path)
      } catch (error) {
        // A cancelled run is not an unreadable note.
        if (context.signal.aborted) throw error
        return {
          path,
          omitted: [],
          error: { code: "unreadable" as const, message: `${path} could not be read.` },
        }
      }
      context.signal.throwIfAborted()
      if (content === null) {
        return {
          path,
          omitted: [],
          error: { code: "not_found" as const, message: `${path} was not found.` },
        }
      }

      const omitted: string[] = []
      return {
        path,
        ...(include.includes("headings") ? { headings: outlineOf(content) } : {}),
        ...(include.includes("links")
          ? { links: linksOf(content, path, vault.listNotes(), limit, omitted) }
          : {}),
        omitted,
      }
    },
  })
}

function linksOf(
  content: string,
  path: string,
  allNotes: ReturnType<VaultReader["listNotes"]>,
  limit: number,
  omitted: string[]
): NonNullable<NoteContextOutput["links"]> {
  const notes = [...allNotes].sort((a, b) => a.path.localeCompare(b.path))
  const resolve = (target: string) => {
    const wanted = target.trim().toLocaleLowerCase()
    return notes.find(
      (note) =>
        note.path.toLocaleLowerCase().replace(/\.md$/, "") === wanted ||
        note.title.toLocaleLowerCase() === wanted
    )
  }

  const links: NonNullable<NoteContextOutput["links"]> = []
  const seen = new Set<string>([path])
  for (const match of content.matchAll(WIKILINK)) {
    const target = match[1]?.trim()
    if (!target) continue
    const note = resolve(target)
    const key = note ? note.path : `broken:${target.toLocaleLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    if (links.length >= limit) {
      omitted.push(`Only the first ${limit} linked notes are listed.`)
      break
    }
    links.push(
      note
        ? { status: "resolved", target, path: note.path, title: note.title }
        : { status: "broken", target }
    )
  }
  return links
}
