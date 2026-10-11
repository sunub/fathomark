import type { RequestCounter } from "../providers/types"

/** Conservative planning estimate, not proof of a model's tokenizer/template. */
export function createLocalCounter(): RequestCounter {
  return {
    async count(request) {
      return {
        promptTokens: new TextEncoder().encode(JSON.stringify(request)).length +
          request.messages.length * 64 + request.tools.length * 128 + 256,
        method: "estimate" as const,
      }
    },
  }
}
