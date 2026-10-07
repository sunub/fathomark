/** Target size of one chunk. Paragraphs are packed until a chunk would pass it. */
const CHUNK_CHARS = 600
/** A chunk is cut here so its excerpt stays under the 4096-byte evidence limit even for wide characters. */
const MAX_CHUNK_CHARS = 1_000
/** Lines longer than this, or holding an unbroken run of this many characters, are embedded images and encodings, not prose. */
const MAX_LINE_CHARS = 2_000
const UNBROKEN_RUN = /\S{200,}/

export interface NoteChunk {
  readonly text: string
}

/**
 * Splits a note into chunks of about 600 characters along paragraph breaks. A note's
 * first chunk keeps its frontmatter, because `isExperienceNote` reads it from there.
 */
export function chunkNote(content: string): NoteChunk[] {
  const prose = content
    .split("\n")
    .filter((line) => line.length < MAX_LINE_CHARS && !UNBROKEN_RUN.test(line))
    .join("\n")
  const paragraphs = prose
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)

  const chunks: NoteChunk[] = []
  let current = ""
  for (const paragraph of paragraphs) {
    if (current !== "" && current.length + paragraph.length > CHUNK_CHARS) {
      chunks.push({ text: current.slice(0, MAX_CHUNK_CHARS) })
      current = paragraph
    } else {
      current = current === "" ? paragraph : `${current}\n${paragraph}`
    }
  }
  if (current !== "") chunks.push({ text: current.slice(0, MAX_CHUNK_CHARS) })
  return chunks
}
