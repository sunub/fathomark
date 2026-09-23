/*
 * ModelProvider — the product-owned interface from docs/ARCHITECTURE.md.
 *
 * Nothing below is an SDK type. That is the whole point: CONTEXT.md calls a
 * provider "a replaceable adapter", and ROADMAP open decision 4 (Ollama native
 * vs OpenAI-compatible) is still open. Whatever wins, it implements this.
 */

export interface ModelInfo {
  readonly id: string
  readonly label: string
  /** Native tool/function calling. Prompt-only JSON emulation is not supported. */
  readonly supportsTools: boolean
  readonly contextLength: number | null
}

export interface ModelRequest {
  readonly model: string
  readonly messages: readonly ModelMessage[]
  readonly tools: readonly ModelToolSchema[]
  readonly maxOutputTokens: number
}

export type ModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: readonly ModelToolCall[] }
  | { role: "tool"; callId: string; content: string }

export interface ModelToolCall {
  readonly callId: string
  readonly name: string
  readonly args: unknown
}

export interface ModelToolSchema {
  readonly name: string
  readonly description: string
  /** JSON Schema, produced from the tool's Zod schema by the registry. */
  readonly parameters: Record<string, unknown>
}

export type ModelEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ModelToolCall }
  | { type: "done"; reason: "stop" | "length" | "tool_calls" }

export interface TokenCount {
  readonly promptTokens: number
}

export interface ProviderHealth {
  readonly reachable: boolean
  /** Shown verbatim in the model status line when unreachable. */
  readonly detail: string
}

export interface ModelProvider {
  readonly id: string
  health(signal: AbortSignal): Promise<ProviderHealth>
  listModels(signal: AbortSignal): Promise<ModelInfo[]>
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent>
  countTokens?(request: ModelRequest): Promise<TokenCount>
}
