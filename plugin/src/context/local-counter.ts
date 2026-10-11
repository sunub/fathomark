import type { RequestCounter } from "../providers/types"

/** Conservative planning estimate, not proof of a model's tokenizer/template. */
export function createLocalCounter(): RequestCounter {
  return {
    async count(request) {
      // A response schema constrains decoding; Ollama does not add it to the prompt.
      const { responseSchema: _schema, ...prompt } = request
      return {
        promptTokens: new TextEncoder().encode(JSON.stringify(prompt)).length +
          request.messages.length * 64 + request.tools.length * 128 + 256,
        method: "estimate" as const,
      }
    },
  }
}
