import { validateLocalProviderUrl } from "./ollama"

/** The default embedding model. Multilingual: the English-centred nomic-embed-text scored 0.14 recall@3 on Korean notes. */
export const DEFAULT_EMBEDDING_MODEL = "bge-m3"

export interface Embedder {
  readonly model: string
  /** One unit-length vector per text, in order. */
  embed(texts: readonly string[], signal: AbortSignal): Promise<number[][]>
}

export function createOllamaEmbedder(
  baseUrl: string,
  model: string = DEFAULT_EMBEDDING_MODEL,
  fetchImpl: typeof fetch = fetch
): Embedder {
  const base = validateLocalProviderUrl(baseUrl)
  return {
    model,
    async embed(texts, signal) {
      if (texts.length === 0) return []
      const response = await fetchImpl(new URL("/api/embed", base), {
        method: "POST",
        signal,
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
      })
      if (!response.ok) throw new Error(`Ollama embedding request failed with ${response.status}.`)
      const body = (await response.json()) as { embeddings?: unknown }
      const vectors = body.embeddings
      if (
        !Array.isArray(vectors) ||
        vectors.length !== texts.length ||
        !vectors.every((vector) => Array.isArray(vector) && vector.every((value) => typeof value === "number"))
      ) {
        throw new Error("Ollama returned an unexpected embedding response.")
      }
      return (vectors as number[][]).map(normalizeVector)
    },
  }
}

export function normalizeVector(vector: readonly number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return length === 0 ? [...vector] : vector.map((value) => value / length)
}
