import type { Embedder } from "../../src/providers/ollama-embedder"
import { normalizeVector } from "../../src/providers/ollama-embedder"

const DIMENSIONS = 64

/** Bag-of-characters vectors: texts that share characters are close. Enough to exercise ranking without a model. */
export function fakeEmbedder(calls: string[][] = []): Embedder {
  return {
    model: "fake-embed",
    async embed(texts) {
      calls.push([...texts])
      return texts.map((text) => {
        const vector = new Array<number>(DIMENSIONS).fill(0)
        for (const char of text.toLowerCase()) {
          if (/\s/.test(char)) continue
          vector[char.codePointAt(0)! % DIMENSIONS] = (vector[char.codePointAt(0)! % DIMENSIONS] ?? 0) + 1
        }
        return normalizeVector(vector)
      })
    },
  }
}
