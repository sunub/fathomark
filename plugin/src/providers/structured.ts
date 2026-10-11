import { z } from "zod"
import type { ZodType } from "zod"
import { raceWithSignal } from "../harness/abort"
import type { ModelProvider, ModelRequest } from "./types"

export type StructuredResult<T> =
  | { readonly ok: true; readonly value: T; readonly usage?: { promptTokens: number; outputTokens: number } }
  | { readonly ok: false; readonly reason: "parse" | "provider" | "length"; readonly detail: string }

export interface StructuredOptions {
  readonly beforeRequest?: (request: ModelRequest) => Promise<void>
}

// A byte cap bounds memory even when a provider ignores its output-token limit.
const MAX_RESPONSE_BYTES = 65_536

export async function callStructured<T>(
  provider: ModelProvider,
  request: ModelRequest,
  schema: ZodType<T>,
  signal: AbortSignal,
  options: StructuredOptions = {},
): Promise<StructuredResult<T>> {
  signal.throwIfAborted()
  // The provider constrains the shape; the prompt still explains it and safeParse stays the final check.
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
  let current: ModelRequest = {
    ...request,
    tools: [],
    responseSchema: jsonSchema,
    // Measured on gemma4:e4b: hidden reasoning took most of the output limit without better verdicts.
    thinking: false,
    messages: [
      { role: "system", content: `Return only JSON matching this schema, without Markdown fences: ${JSON.stringify(jsonSchema)}` },
      ...request.messages,
    ],
  }
  let usage: { promptTokens: number; outputTokens: number } | undefined
  let completeUsage = true
  for (let attempt = 0; attempt < 2; attempt++) {
    // Budget failures belong to the workflow and must not become parse retries.
    if (options.beforeRequest) await raceWithSignal(options.beforeRequest(current), signal)
    signal.throwIfAborted()
    let text = ""
    let bytes = 0
    let stopped = false
    const attemptAbort = new AbortController()
    const onAbort = () => attemptAbort.abort(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
    let iterator: AsyncIterator<import("./types").ModelEvent> | undefined
    try {
      iterator = provider.stream(current, attemptAbort.signal)[Symbol.asyncIterator]()
      while (true) {
        const next = await raceWithSignal(iterator.next(), signal)
        if (next.done) break
        const event = next.value
        if (event.type === "tool_call") {
          return { ok: false, reason: "provider", detail: "Structured calls cannot invoke tools." }
        }
        if (event.type === "text") {
          bytes += new TextEncoder().encode(event.delta).length
          if (bytes > MAX_RESPONSE_BYTES) return { ok: false, reason: "length", detail: "Structured response exceeds 65536 bytes." }
          text += event.delta
        } else {
          if (event.reason !== "stop") return { ok: false, reason: event.reason === "length" ? "length" : "provider", detail: `Unexpected completion: ${event.reason}` }
          stopped = true
          if (!event.usage) completeUsage = false
          if (event.usage) {
            usage = {
              promptTokens: (usage?.promptTokens ?? 0) + event.usage.promptTokens,
              outputTokens: (usage?.outputTokens ?? 0) + event.usage.outputTokens,
            }
          }
          break
        }
      }
      if (!stopped) return { ok: false, reason: "provider", detail: "Response ended without a stop completion." }
    } catch (error) {
      signal.throwIfAborted()
      return { ok: false, reason: "provider", detail: error instanceof Error ? error.message : String(error) }
    } finally {
      signal.removeEventListener("abort", onAbort)
      attemptAbort.abort()
      // Do not let an uncooperative iterator block cancellation or completion.
      if (iterator?.return) void iterator.return().catch(() => {})
    }
    try {
      const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(text.trim())
      const parsed = schema.safeParse(JSON.parse(fenced?.[1] ?? text))
      if (parsed.success) return { ok: true, value: parsed.data, ...(completeUsage && usage ? { usage } : {}) }
    } catch {
      // Invalid JSON follows the same single repair path as invalid fields.
    }
    current = {
      ...current,
      messages: [...current.messages, { role: "assistant", content: text }, { role: "user", content: "The previous output did not match the JSON schema. Return one valid JSON object matching the schema. Preserve the supplied facts." }],
    }
  }
  return { ok: false, reason: "parse", detail: "JSON parsing or schema validation failed after one repair." }
}
