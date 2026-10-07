import type { Embedder } from "../providers/ollama-embedder"
import type { NoteSummary } from "../obsidian/vault-adapter"
import { chunkNote } from "./chunk"

const EMBED_BATCH = 32
const STORE_VERSION = 1

export interface IndexedChunk {
  readonly text: string
  /** Unit length, so a dot product is the cosine similarity. */
  readonly vector: Float32Array
}

export interface IndexedNote {
  readonly path: string
  /** `mtime` when the vault reports one, else the content length; a change means "read it again". */
  readonly stamp: string
  readonly chunks: readonly IndexedChunk[]
}

export interface StoredIndex {
  readonly version: number
  readonly model: string
  readonly notes: ReadonlyArray<{
    readonly path: string
    readonly stamp: string
    readonly chunks: ReadonlyArray<{ readonly text: string; readonly vector: string }>
  }>
}

export interface IndexStore {
  load(): Promise<StoredIndex | null>
  save(index: StoredIndex): Promise<void>
}

export interface NoteSource {
  listNotes(): NoteSummary[]
  readNote(path: string): Promise<string | null>
}

export interface SyncResult {
  readonly embedded: number
  readonly removed: number
  readonly unchanged: number
}

export interface ChunkHit {
  readonly path: string
  readonly text: string
  readonly score: number
}

/**
 * Chunk embeddings of the vault, kept in memory and persisted through an `IndexStore`.
 * `sync` embeds only notes whose stamp changed, so a restart costs a file read, not a re-embed.
 */
export class VectorIndex {
  private readonly notes = new Map<string, IndexedNote>()

  constructor(
    private readonly embedder: Embedder,
    private readonly store?: IndexStore
  ) {}

  get noteCount(): number {
    return this.notes.size
  }

  get(path: string): IndexedNote | undefined {
    return this.notes.get(path)
  }

  allNotes(): IterableIterator<IndexedNote> {
    return this.notes.values()
  }

  async load(): Promise<void> {
    const stored = await this.store?.load()
    // A different model gives vectors that cannot be compared with new ones.
    if (!stored || stored.version !== STORE_VERSION || stored.model !== this.embedder.model) return
    this.notes.clear()
    for (const note of stored.notes) {
      this.notes.set(note.path, {
        path: note.path,
        stamp: note.stamp,
        chunks: note.chunks.map((chunk) => ({ text: chunk.text, vector: decodeVector(chunk.vector) })),
      })
    }
  }

  async sync(source: NoteSource, signal: AbortSignal): Promise<SyncResult> {
    const listed = source.listNotes()
    const present = new Set(listed.map((note) => note.path))
    let removed = 0
    for (const path of [...this.notes.keys()]) {
      if (!present.has(path)) {
        this.notes.delete(path)
        removed += 1
      }
    }

    let embedded = 0
    let unchanged = 0
    try {
      for (const summary of listed) {
        signal.throwIfAborted()
        const known = this.notes.get(summary.path)
        if (summary.mtime !== undefined && known?.stamp === String(summary.mtime)) {
          unchanged += 1
          continue
        }
        const content = await source.readNote(summary.path)
        if (content === null) continue
        const stamp = summary.mtime !== undefined ? String(summary.mtime) : String(content.length)
        if (known?.stamp === stamp) {
          unchanged += 1
          continue
        }
        this.notes.set(summary.path, { path: summary.path, stamp, chunks: await this.embedChunks(content, signal) })
        embedded += 1
      }
    } finally {
      // An aborted or failed sync still keeps the notes it finished.
      await this.persist()
    }
    return { embedded, removed, unchanged }
  }

  /**
   * Best chunk of every note against a unit-length query vector, best first. Chunks `accept`
   * rejects are not scored; a note with no accepted chunk is left out.
   */
  search(queryVector: readonly number[], accept: (text: string) => boolean = () => true): ChunkHit[] {
    const hits: ChunkHit[] = []
    for (const note of this.notes.values()) {
      let best: ChunkHit | null = null
      for (const chunk of note.chunks) {
        if (!accept(chunk.text)) continue
        const score = dot(queryVector, chunk.vector)
        if (best === null || score > best.score) best = { path: note.path, text: chunk.text, score }
      }
      if (best) hits.push(best)
    }
    return hits.sort((left, right) => right.score - left.score)
  }

  /** The `count` accepted chunks of one note closest to the query, in the order they appear in the note. */
  topChunks(
    path: string,
    queryVector: readonly number[],
    count: number,
    accept: (text: string) => boolean = () => true
  ): string[] {
    const chunks = this.notes.get(path)?.chunks ?? []
    return chunks
      .map((chunk, position) => ({ position, text: chunk.text, score: dot(queryVector, chunk.vector) }))
      .filter((chunk) => accept(chunk.text))
      .sort((left, right) => right.score - left.score)
      .slice(0, count)
      .sort((left, right) => left.position - right.position)
      .map((chunk) => chunk.text)
  }

  private async embedChunks(content: string, signal: AbortSignal): Promise<IndexedChunk[]> {
    const chunks = chunkNote(content)
    const result: IndexedChunk[] = []
    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      const batch = chunks.slice(start, start + EMBED_BATCH)
      const vectors = await this.embedder.embed(batch.map((chunk) => chunk.text), signal)
      batch.forEach((chunk, offset) => result.push({ text: chunk.text, vector: Float32Array.from(vectors[offset] ?? []) }))
    }
    return result
  }

  private async persist(): Promise<void> {
    if (!this.store) return
    await this.store.save({
      version: STORE_VERSION,
      model: this.embedder.model,
      notes: [...this.notes.values()].map((note) => ({
        path: note.path,
        stamp: note.stamp,
        chunks: note.chunks.map((chunk) => ({ text: chunk.text, vector: encodeVector(chunk.vector) })),
      })),
    })
  }
}

function dot(left: readonly number[], right: Float32Array): number {
  let sum = 0
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) sum += (left[index] ?? 0) * (right[index] ?? 0)
  return sum
}

/** Float32 as base64: a 1024-dimension vector is 5.5 KB instead of 10+ KB of JSON digits. */
export function encodeVector(vector: Float32Array): string {
  const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength)
  let binary = ""
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary)
}

export function decodeVector(encoded: string): Float32Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Float32Array(bytes.buffer)
}
