import { describe, expect, it } from "vitest"

import { createOllamaEmbedder } from "../src/providers/ollama-embedder"

const signal = new AbortController().signal

function respond(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe("createOllamaEmbedder", () => {
  it("returns unit-length vectors in order", async () => {
    const embedder = createOllamaEmbedder("http://127.0.0.1:11434", "bge-m3", respond({ embeddings: [[3, 4], [0, 2]] }))
    expect(await embedder.embed(["a", "b"], signal)).toEqual([
      [0.6, 0.8],
      [0, 1],
    ])
  })

  it("posts the model and the whole batch to /api/embed", async () => {
    let seen: { url: string; body: unknown } | null = null
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      seen = { url: url.toString(), body: JSON.parse(String(init.body)) }
      return new Response(JSON.stringify({ embeddings: [[1], [1]] }))
    }) as unknown as typeof fetch
    await createOllamaEmbedder("http://localhost:11434", "bge-m3", fetchImpl).embed(["x", "y"], signal)
    expect(seen).toEqual({ url: "http://localhost:11434/api/embed", body: { model: "bge-m3", input: ["x", "y"] } })
  })

  it("refuses a provider that is not on a loopback address", () => {
    expect(() => createOllamaEmbedder("http://example.com:11434")).toThrow(/loopback/)
  })

  it("rejects a failed or malformed response", async () => {
    const failing = createOllamaEmbedder("http://127.0.0.1:11434", "bge-m3", respond({}, 500))
    await expect(failing.embed(["a"], signal)).rejects.toThrow(/500/)
    const short = createOllamaEmbedder("http://127.0.0.1:11434", "bge-m3", respond({ embeddings: [[1]] }))
    await expect(short.embed(["a", "b"], signal)).rejects.toThrow(/unexpected/)
  })

  it("sends nothing for an empty batch", async () => {
    const embedder = createOllamaEmbedder("http://127.0.0.1:11434", "bge-m3", respond({}, 500))
    expect(await embedder.embed([], signal)).toEqual([])
  })
})
