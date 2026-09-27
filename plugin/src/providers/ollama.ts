import { VERIFIED_BUDGET_PROFILES } from "../context/tokenizer-profiles"
import { decodeNdjson } from "./ndjson"
import type {
  ModelEvent,
  ModelInfo,
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ProviderHealth,
} from "./types"

interface JsonObject {
  readonly [key: string]: unknown
}

export function validateLocalProviderUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The local provider URL must use HTTP or HTTPS.")
  }
  if (url.username || url.password) throw new Error("Provider URLs must not contain credentials.")
  if (!isLoopback(url.hostname)) throw new Error("The provider must use a loopback address.")
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("The provider URL must not contain a path, query, or fragment.")
  }
  return url
}

export function createOllamaProvider(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): ModelProvider {
  const base = validateLocalProviderUrl(baseUrl)
  let streamSequence = 0

  async function request(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const response = await fetchImpl(new URL(path, base), {
      ...init,
      signal,
      redirect: "error",
      headers: { "Content-Type": "application/json", ...init.headers },
    })
    if (response.redirected) throw new Error("The local provider attempted a redirect.")
    if (!response.ok) {
      const detail = await readError(response)
      throw new Error(`Ollama request failed with ${response.status}: ${detail}`)
    }
    return response
  }

  return {
    id: "ollama",

    async health(signal: AbortSignal): Promise<ProviderHealth> {
      try {
        await request("/api/tags", { method: "GET" }, signal)
        return { reachable: true, detail: "Ollama is reachable." }
      } catch (error) {
        return { reachable: false, detail: error instanceof Error ? error.message : String(error) }
      }
    },

    async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
      const tagsResponse = await request("/api/tags", { method: "GET" }, signal)
      const tags = asObject(await tagsResponse.json())
      const models = Array.isArray(tags.models) ? tags.models : []
      const result: ModelInfo[] = []
      for (const candidate of models) {
        const tag = asObject(candidate)
        const id = stringField(tag, "name") ?? stringField(tag, "model")
        if (!id) continue
        const showResponse = await request(
          "/api/show",
          { method: "POST", body: JSON.stringify({ model: id }) },
          signal
        )
        const show = asObject(await showResponse.json())
        const capabilities = Array.isArray(show.capabilities)
          ? show.capabilities.filter((item): item is string => typeof item === "string")
          : []
        const contextLength = readContextLength(asObject(show.model_info))
        const supportsTools = capabilities.includes("tools") || capabilities.includes("tool_calling")
        const hasTemplate = typeof show.template === "string" && show.template.length > 0
        const hasVerifiedBudget = VERIFIED_BUDGET_PROFILES.length > 0
        const usable = supportsTools && contextLength !== null && hasTemplate && hasVerifiedBudget
        const reason = usable
          ? undefined
          : !supportsTools
            ? "The model does not advertise native tool calling."
            : contextLength === null
              ? "The model does not advertise a context length."
              : !hasTemplate
                ? "The model does not expose its chat template."
                : "No verified tokenizer budget profile matches this installation."
        result.push({ id, label: id, supportsTools, contextLength, usable, ...(reason ? { reason } : {}) })
      }
      return result
    },

    async *stream(modelRequest: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent> {
      const sequence = ++streamSequence
      const response = await request(
        "/api/chat",
        {
          method: "POST",
          body: JSON.stringify({
            model: modelRequest.model,
            messages: toOllamaMessages(modelRequest.messages),
            tools: modelRequest.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            stream: true,
            options: {
              num_ctx: modelRequest.contextWindow,
              num_predict: modelRequest.maxOutputTokens,
            },
            keep_alive: "5m",
          }),
        },
        signal
      )
      if (!response.body) throw new Error("Ollama returned no response stream.")

      let sawDone = false
      let toolIndex = 0
      for await (const raw of decodeNdjson(response.body, signal)) {
        const chunk = asObject(raw)
        const streamError = stringField(chunk, "error")
        if (streamError) throw new Error(`Ollama stream failed: ${streamError}`)
        const message = asObject(chunk.message)
        const content = stringField(message, "content")
        if (content) yield { type: "text", delta: content }

        const calls = Array.isArray(message.tool_calls) ? message.tool_calls : []
        for (const rawCall of calls) {
          const call = asObject(rawCall)
          const fn = asObject(call.function)
          const name = stringField(fn, "name")
          if (!name || !("arguments" in fn)) throw new Error("Ollama returned an invalid tool call.")
          yield {
            type: "tool_call",
            call: {
              callId: `ollama-${sequence}-${toolIndex++}`,
              name,
              args: fn.arguments,
            },
          }
        }

        if (chunk.done === true) {
          sawDone = true
          const usage = usageFromChunk(chunk)
          yield {
            type: "done",
            reason: calls.length > 0 ? "tool_calls" : normalizeDoneReason(stringField(chunk, "done_reason")),
            ...(usage ? { usage } : {}),
          }
        }
      }
      if (!sawDone) throw new Error("Ollama stream ended without done=true.")
    },
  }
}

function toOllamaMessages(messages: readonly ModelMessage[]): JsonObject[] {
  const callNames = new Map<string, string>()
  return messages.map((message) => {
    if (message.role === "assistant") {
      const toolCalls = message.toolCalls?.map((call, index) => {
        callNames.set(call.callId, call.name)
        return {
          type: "function",
          function: { index, name: call.name, arguments: call.args },
        }
      })
      return {
        role: message.role,
        content: message.content,
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      }
    }
    if (message.role === "tool") {
      const toolName = callNames.get(message.callId)
      if (!toolName) throw new Error(`Tool result ${message.callId} has no matching assistant call.`)
      return { role: "tool", tool_name: toolName, content: message.content }
    }
    return { role: message.role, content: message.content }
  })
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function stringField(object: JsonObject, key: string): string | null {
  return typeof object[key] === "string" ? object[key] : null
}

function readContextLength(info: JsonObject): number | null {
  for (const [key, value] of Object.entries(info)) {
    if (key.endsWith(".context_length") && typeof value === "number" && value > 0) return value
  }
  return null
}

function normalizeDoneReason(reason: string | null): "stop" | "length" {
  return reason === "length" ? "length" : "stop"
}

function usageFromChunk(chunk: JsonObject):
  | {
      promptTokens: number
      outputTokens: number
      loadMs?: number
      promptMs?: number
      generationMs?: number
    }
  | undefined {
  if (typeof chunk.prompt_eval_count !== "number" || typeof chunk.eval_count !== "number") {
    return undefined
  }
  return {
    promptTokens: chunk.prompt_eval_count,
    outputTokens: chunk.eval_count,
    ...(typeof chunk.load_duration === "number" ? { loadMs: chunk.load_duration / 1_000_000 } : {}),
    ...(typeof chunk.prompt_eval_duration === "number"
      ? { promptMs: chunk.prompt_eval_duration / 1_000_000 }
      : {}),
    ...(typeof chunk.eval_duration === "number"
      ? { generationMs: chunk.eval_duration / 1_000_000 }
      : {}),
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const value = asObject(await response.json())
    return stringField(value, "error") ?? response.statusText
  } catch {
    return response.statusText || "Unknown provider error"
  }
}

function isLoopback(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") return true
  const octets = hostname.split(".").map(Number)
  return octets.length === 4 && octets[0] === 127 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
}
