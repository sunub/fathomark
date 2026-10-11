import { describe, expect, it } from "vitest"

import type { Embedder } from "../src/providers/ollama-embedder"
import { SemanticIndexer } from "../src/retrieval/semantic-indexer"
import { VectorIndex } from "../src/retrieval/vector-index"
import { fakeEmbedder } from "./support/fake-embedder"

const notes = new Map([["a.md", "# A\n\n캐시를 도입해 지연을 줄였다."], ["b.md", "# B\n\n빌드 시간을 줄였다."]])
const vault = {
  listNotes: () => [...notes.keys()].map((path) => ({ path, title: path, mtime: 1 })),
  readNote: async (path: string) => notes.get(path) ?? null,
}
const signal = () => new AbortController().signal

function indexer(enabled = true, embedder: Embedder = fakeEmbedder()) {
  const index = new VectorIndex(embedder)
  let on = enabled
  const service = new SemanticIndexer(index, embedder, () => on)
  return { service, index, enable: (value: boolean) => { on = value } }
}

describe("semantic indexer", () => {
  it("offers no backend before the index has notes, so search stays keyword only", () => {
    expect(indexer().service.backend()).toBeUndefined()
  })

  it("offers the backend once a refresh indexed the vault", async () => {
    const { service } = indexer()
    await service.refresh(vault, signal())
    expect(service.backend()?.index.noteCount).toBe(2)
  })

  it("attaches the evidence judge to the backend it offers", async () => {
    const embedder = fakeEmbedder()
    const judge = { model: "gemma4:e4b", supports: async () => true }
    const service = new SemanticIndexer(new VectorIndex(embedder), embedder, () => true, () => judge)
    await service.refresh(vault, signal())
    expect(service.backend()?.judge).toBe(judge)
  })

  it("offers nothing and indexes nothing while the setting is off", async () => {
    const calls: string[][] = []
    const { service, enable } = indexer(false, fakeEmbedder(calls))
    await service.refresh(vault, signal())
    expect(calls).toEqual([])
    enable(true)
    await service.refresh(vault, signal())
    enable(false)
    expect(service.backend()).toBeUndefined()
  })

  it("runs one refresh at a time and reuses the one in flight", async () => {
    const calls: string[][] = []
    const { service } = indexer(true, fakeEmbedder(calls))
    await Promise.all([service.refresh(vault, signal()), service.refresh(vault, signal())])
    expect(calls.flat()).toHaveLength(2)
  })

  it("keeps keyword search when the embedding model is missing, and reports why", async () => {
    const failing: Embedder = { model: "bge-m3", embed: async () => { throw new Error("model \"bge-m3\" not found") } }
    const { service } = indexer(true, failing)
    await expect(service.refresh(vault, signal())).resolves.toBeUndefined()
    expect(service.backend()).toBeUndefined()
    expect(service.lastError).toContain("bge-m3")
  })
})
