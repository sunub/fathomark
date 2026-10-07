import type { SemanticBackend } from "../../src/tools/hybrid-search"
import type { VaultReader } from "../../src/tools/vault-search"
import type { VectorIndex } from "../../src/retrieval/vector-index"

/**
 * Hides notes from a search, to evaluate a real application question the way the product
 * meets it: the note the question was copied from is not evidence for answering it.
 */
export function withoutNotes(vault: VaultReader, hidden: ReadonlySet<string>): VaultReader {
  return {
    listNotes: () => vault.listNotes().filter((note) => !hidden.has(note.path.normalize("NFC"))),
    readNote: (path) => vault.readNote(path),
  }
}

export function withoutIndexed(semantic: SemanticBackend, hidden: ReadonlySet<string>): SemanticBackend {
  const { index } = semantic
  const visible = (path: string) => !hidden.has(path.normalize("NFC"))
  const filtered = {
    get noteCount() {
      return [...index.allNotes()].filter((note) => visible(note.path)).length
    },
    get: (path: string) => (visible(path) ? index.get(path) : undefined),
    allNotes: () => [...index.allNotes()].filter((note) => visible(note.path))[Symbol.iterator](),
    search: (vector: readonly number[], accept?: (text: string) => boolean) =>
      index.search(vector, accept).filter((hit) => visible(hit.path)),
    topChunks: (path: string, vector: readonly number[], count: number, accept?: (text: string) => boolean) =>
      visible(path) ? index.topChunks(path, vector, count, accept) : [],
  }
  return { ...semantic, index: filtered as unknown as VectorIndex }
}
