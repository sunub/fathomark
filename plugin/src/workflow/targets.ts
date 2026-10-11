import type { EditorPosition, EditorTarget } from "../context/insertion"
import type { CurrentNoteContext } from "../context/packet"

export interface ParagraphCandidate {
  readonly id: string
  readonly path: string
  readonly text: string
  readonly from: EditorPosition
  readonly to: EditorPosition
  readonly documentText: string
}

/** Selection-only context cannot establish absolute editor positions. */
export function paragraphCandidates(note: CurrentNoteContext | null): readonly ParagraphCandidate[] {
  if (!note || note.isSelection) return []

  const lines = Array.from(note.text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g))
    .filter((match) => match[0].length > 0)
    .map((match) => ({ text: match[0].replace(/[\r\n]+$/, ""), offset: match.index }))
  const candidates: ParagraphCandidate[] = []
  let start: number | null = null
  let frontmatter = lines[0]?.text === "---"
  let fence: { marker: string; length: number } | null = null

  function flush(end: number): void {
    if (start === null) return
    const first = lines[start]!
    const last = lines[end]!
    const text = note!.text.slice(first.offset, last.offset + last.text.length)
    if (text.length <= 2_000 && candidates.length < 40) {
      candidates.push({
        id: `${note!.path}#paragraph-${start + 1}-${end + 1}`,
        path: note!.path,
        text,
        from: { line: start, ch: 0 },
        to: { line: end, ch: last.text.length },
        documentText: note!.text,
      })
    }
    start = null
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.text
    if (frontmatter) {
      if (index > 0 && (line === "---" || line === "...")) frontmatter = false
      continue
    }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (marker && marker[1]![0] === fence.marker && marker[1]!.length >= fence.length && !marker[2]!.trim()) {
        fence = null
      }
      continue
    }
    if (marker) {
      flush(index - 1)
      fence = { marker: marker[1]![0]!, length: marker[1]!.length }
      continue
    }
    if (!line.trim() || /^ {0,3}#{1,6}(?:\s|$)/.test(line)) {
      flush(index - 1)
      continue
    }
    if (start === null) start = index
  }
  flush(lines.length - 1)
  return candidates
}

export function targetFromCandidate(candidate: ParagraphCandidate): EditorTarget {
  return {
    id: candidate.id,
    path: candidate.path,
    text: candidate.documentText,
    selection: candidate.text,
    from: candidate.from,
    to: candidate.to,
  }
}

export function resolveParagraphTarget(
  candidates: readonly ParagraphCandidate[],
  id: string,
): EditorTarget | null {
  const candidate = candidates.find((item) => item.id === id)
  return candidate ? targetFromCandidate(candidate) : null
}
