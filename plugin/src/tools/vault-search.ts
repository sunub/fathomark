import type { VaultEvidenceReference } from "../context/evidence"
import type { NoteSummary } from "../obsidian/vault-adapter"

export interface VaultReader {
  listNotes(): NoteSummary[]
  readNote(path: string): Promise<string | null>
}

const MAX_NOTES = 1_000
const MAX_EXCERPT_BYTES = 4_096
const READ_CONCURRENCY = 4

interface RankedReference {
  readonly score: number
  readonly reference: VaultEvidenceReference
}

export async function searchVault(
  vault: VaultReader,
  query: string,
  limit: number,
  signal: AbortSignal
): Promise<{ references: VaultEvidenceReference[]; omitted: string[] }> {
  const allNotes = vault.listNotes()
  const notes = allNotes.slice(0, MAX_NOTES)
  const omitted = allNotes.length > MAX_NOTES ? [`Only the first ${MAX_NOTES} notes were searched.`] : []
  const terms = words(query)
  const ranked: RankedReference[] = []
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (true) {
      signal.throwIfAborted()
      const index = nextIndex++
      const note = notes[index]
      if (!note) return
      const content = await vault.readNote(note.path)
      signal.throwIfAborted()
      if (content === null) {
        omitted.push(`${note.path}: note disappeared during search`)
        continue
      }
      const score = scoreNote(note, content, terms)
      if (score === 0) continue
      const paragraph = paragraphs(content).find((item) => containsTerm(item.text, terms))
      if (!paragraph) continue
      if (utf8Bytes(paragraph.text) > MAX_EXCERPT_BYTES) {
        omitted.push(`${note.path}: matching paragraph exceeds ${MAX_EXCERPT_BYTES} UTF-8 bytes`)
        continue
      }
      ranked.push({
        score,
        reference: {
          kind: "vault",
          path: note.path,
          ...(paragraph.heading ? { heading: paragraph.heading } : {}),
          excerpt: paragraph.text,
        },
      })
    }
  }

  await Promise.all(Array.from({ length: READ_CONCURRENCY }, () => worker()))
  ranked.sort((left, right) => right.score - left.score || left.reference.path.localeCompare(right.reference.path))
  return { references: ranked.slice(0, limit).map((item) => item.reference), omitted }
}

export function excerptForHeading(
  content: string,
  heading?: string
): { excerpt: string | null; heading?: string; omitted: string[] } {
  const normalizedHeading = heading ? normalize(heading) : null
  const available = paragraphs(content).filter((item) =>
    normalizedHeading === null ? true : normalize(item.heading ?? "") === normalizedHeading
  )
  if (heading && available.length === 0) {
    return { excerpt: null, heading, omitted: [`heading not found: ${heading}`] }
  }
  const selected: string[] = []
  const omitted: string[] = []
  for (const paragraph of available) {
    const next = [...selected, paragraph.text].join("\n\n")
    if (utf8Bytes(paragraph.text) > MAX_EXCERPT_BYTES) {
      omitted.push(`paragraph exceeds ${MAX_EXCERPT_BYTES} UTF-8 bytes`)
      continue
    }
    if (utf8Bytes(next) > MAX_EXCERPT_BYTES) {
      omitted.push("additional paragraphs omitted by the 4096 UTF-8 byte limit")
      break
    }
    selected.push(paragraph.text)
  }
  return {
    excerpt: selected.length > 0 ? selected.join("\n\n") : null,
    ...(heading ? { heading: available[0]?.heading ?? heading.trim() } : {}),
    omitted,
  }
}

function scoreNote(note: NoteSummary, content: string, terms: readonly string[]): number {
  const title = normalize(note.title)
  const body = normalize(content)
  return terms.reduce(
    (score, term) => score + (title.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0),
    0
  )
}

function words(value: string): string[] {
  return [...new Set(normalize(value).split(/\s+/).filter(Boolean))]
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim()
}

function containsTerm(value: string, terms: readonly string[]): boolean {
  const normalized = normalize(value)
  return terms.some((term) => normalized.includes(term))
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

function paragraphs(content: string): Array<{ heading?: string; text: string }> {
  const result: Array<{ heading?: string; text: string }> = []
  let heading: string | undefined
  let lines: string[] = []
  const flush = () => {
    const text = lines.join("\n").trim()
    if (text) result.push({ ...(heading ? { heading } : {}), text })
    lines = []
  }
  for (const line of content.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (match) {
      flush()
      heading = match[2]?.normalize("NFKC").trim()
    } else if (line.trim() === "") {
      flush()
    } else {
      lines.push(line)
    }
  }
  flush()
  return result
}
