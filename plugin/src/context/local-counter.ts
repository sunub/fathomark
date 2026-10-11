import type { RequestCounter } from "../providers/types"

/*
 * Real tokens per UTF-8 byte, measured 2026-10-11 with Ollama prompt_eval_count on gemma4:e4b,
 * qwen3:1.7b and exaone3.5:7.8b (docs/testing/tokenizer-profiles.md). Korean notes, Korean JSON
 * and English prompts stayed at or below 0.35; 0.5 keeps headroom. Digit runs reach 1.0, which
 * is why requestView / TOKENS_PER_BYTE must not exceed the model context.
 */
export const TOKENS_PER_BYTE = 0.5

export function estimateTokens(text: string): number {
  return Math.ceil(new TextEncoder().encode(text).length * TOKENS_PER_BYTE)
}

/** Planning estimate calibrated on real models, not proof of a model's tokenizer/template. */
export function createLocalCounter(): RequestCounter {
  return {
    async count(request) {
      // A response schema constrains decoding; Ollama does not add it to the prompt.
      const { responseSchema: _schema, ...prompt } = request
      return {
        promptTokens: estimateTokens(JSON.stringify(prompt)) +
          request.messages.length * 64 + request.tools.length * 128 + 256,
        method: "estimate" as const,
      }
    },
  }
}
