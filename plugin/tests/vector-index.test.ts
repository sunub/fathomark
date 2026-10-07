import { describe, expect, it } from "vitest"

import { decodeVector, encodeVector, type IndexStore, type StoredIndex, VectorIndex } from "../src/retrieval/vector-index"
import { fakeEmbedder } from "./support/fake-embedder"

const signal = new AbortController().signal

function sourceOf(notes: Record<string, { content: string; mtime?: number }>) {
  return {
    listNotes: () =>
      Object.entries(notes).map(([path, note]) => ({
        path,
        title: path,
        ...(note.mtime === undefined ? {} : { mtime: note.mtime }),
      })),
    readNote: async (path: string) => notes[path]?.content ?? null,
  }
}

function memoryStore(): IndexStore & { saved: StoredIndex | null } {
  const store = {
    saved: null as StoredIndex | null,
    load: async () => store.saved,
    save: async (index: StoredIndex) => {
      store.saved = index
    },
  }
  return store
}

describe("VectorIndex", () => {
  it("embeds every note on the first sync and nothing when no stamp changed", async () => {
    const calls: string[][] = []
    const index = new VectorIndex(fakeEmbedder(calls))
    const source = sourceOf({ "a.md": { content: "알파 노트", mtime: 1 }, "b.md": { content: "베타 노트", mtime: 1 } })
    expect(await index.sync(source, signal)).toEqual({ embedded: 2, removed: 0, unchanged: 0 })
    expect(await index.sync(source, signal)).toEqual({ embedded: 0, removed: 0, unchanged: 2 })
    expect(calls).toHaveLength(2)
  })

  it("re-embeds only the note whose mtime changed and drops deleted notes", async () => {
    const index = new VectorIndex(fakeEmbedder())
    await index.sync(sourceOf({ "a.md": { content: "알파", mtime: 1 }, "b.md": { content: "베타", mtime: 1 } }), signal)
    const result = await index.sync(sourceOf({ "a.md": { content: "알파 수정", mtime: 2 } }), signal)
    expect(result).toEqual({ embedded: 1, removed: 1, unchanged: 0 })
    expect(index.noteCount).toBe(1)
  })

  it("falls back to the content length when the vault reports no mtime", async () => {
    const index = new VectorIndex(fakeEmbedder())
    await index.sync(sourceOf({ "a.md": { content: "알파" } }), signal)
    expect(await index.sync(sourceOf({ "a.md": { content: "알파" } }), signal)).toMatchObject({ embedded: 0, unchanged: 1 })
    expect(await index.sync(sourceOf({ "a.md": { content: "알파 더 길어짐" } }), signal)).toMatchObject({ embedded: 1 })
  })

  it("restores a saved index without embedding again", async () => {
    const store = memoryStore()
    const source = sourceOf({ "a.md": { content: "알파 노트", mtime: 1 } })
    await new VectorIndex(fakeEmbedder(), store).sync(source, signal)
    const calls: string[][] = []
    const restored = new VectorIndex(fakeEmbedder(calls), store)
    await restored.load()
    expect(restored.noteCount).toBe(1)
    expect(await restored.sync(source, signal)).toMatchObject({ embedded: 0, unchanged: 1 })
    expect(calls).toEqual([])
  })

  it("ignores a saved index made by another model", async () => {
    const store = memoryStore()
    store.saved = { version: 1, model: "other", notes: [{ path: "a.md", stamp: "1", chunks: [] }] }
    const index = new VectorIndex(fakeEmbedder(), store)
    await index.load()
    expect(index.noteCount).toBe(0)
  })

  it("keeps the notes it finished when the sync is aborted", async () => {
    const store = memoryStore()
    const controller = new AbortController()
    const embedder = fakeEmbedder()
    const aborting = {
      ...embedder,
      async embed(texts: readonly string[], abortSignal: AbortSignal) {
        const vectors = await embedder.embed(texts, abortSignal)
        controller.abort()
        return vectors
      },
    }
    const index = new VectorIndex(aborting, store)
    const source = sourceOf({ "a.md": { content: "알파", mtime: 1 }, "b.md": { content: "베타", mtime: 1 } })
    await expect(index.sync(source, controller.signal)).rejects.toThrow()
    expect(index.noteCount).toBe(1)
    expect(store.saved?.notes.map((note) => note.path)).toEqual(["a.md"])
  })

  it("ranks the note whose chunk is closest to the query first", async () => {
    const embedder = fakeEmbedder()
    const index = new VectorIndex(embedder)
    await index.sync(sourceOf({ "cache.md": { content: "캐시 도입 사례" }, "other.md": { content: "zzz qqq xxx" } }), signal)
    const [query] = await embedder.embed(["캐시 도입"], signal)
    const hits = index.search(query!)
    expect(hits.map((hit) => hit.path)).toEqual(["cache.md", "other.md"])
    expect(hits[0]?.text).toBe("캐시 도입 사례")
  })

  it("skips chunks the predicate rejects, and drops a note left with none", async () => {
    const embedder = fakeEmbedder()
    const index = new VectorIndex(embedder)
    await index.sync(sourceOf({ "cache.md": { content: "캐시 도입 사례" }, "other.md": { content: "zzz qqq xxx" } }), signal)
    const [query] = await embedder.embed(["캐시 도입"], signal)
    expect(index.search(query!, (text) => !text.includes("캐시")).map((hit) => hit.path)).toEqual(["other.md"])
  })

  it("returns a note's closest chunks in note order", async () => {
    const embedder = fakeEmbedder()
    const index = new VectorIndex(embedder)
    const paragraph = (word: string) => `${word} `.repeat(200).trim()
    const content = [paragraph("가나"), paragraph("캐시"), paragraph("다라"), paragraph("도입")].join("\n\n")
    await index.sync(sourceOf({ "a.md": { content } }), signal)
    const [query] = await embedder.embed(["캐시 도입"], signal)
    const top = index.topChunks("a.md", query!, 2)
    expect(top).toHaveLength(2)
    expect(top[0]).toContain("캐시")
    expect(top[1]).toContain("도입")
    expect(index.topChunks("a.md", query!, 1, (text) => !text.includes("캐시"))[0]).toContain("도입")
    expect(index.topChunks("missing.md", query!, 2)).toEqual([])
  })

  it("round-trips a vector through its base64 form", () => {
    const vector = Float32Array.from([0.25, -0.5, 1, 0])
    expect(Array.from(decodeVector(encodeVector(vector)))).toEqual([0.25, -0.5, 1, 0])
  })
})
