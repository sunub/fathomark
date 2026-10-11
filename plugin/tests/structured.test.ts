import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { callStructured } from "../src/providers/structured"
import type { ModelEvent, ModelProvider, ModelRequest } from "../src/providers/types"

const request: ModelRequest = { model: "m", messages: [{ role: "user", content: "write" }], tools: [{ name: "t", description: "t", parameters: {} }], maxOutputTokens: 100, contextWindow: 4096 }
const schema = z.object({ text: z.string() })
function provider(attempts: ModelEvent[][]): ModelProvider {
  let index = 0
  return { id: "test", health: async () => ({ reachable: true, detail: "" }), listModels: async () => [], stream: vi.fn(async function* () { yield* attempts[index++]! }) }
}
const signal = () => new AbortController().signal
const done: ModelEvent = { type: "done", reason: "stop", usage: { promptTokens: 4, outputTokens: 2 } }

describe("structured model calls", () => {
  it("validates JSON, disables tools and accounts for both repair attempts", async () => {
    const model = provider([[{ type: "text", delta: "bad" }, done], [{ type: "text", delta: '{"text":"ok"}' }, done]])
    const beforeRequest = vi.fn(async () => {})
    expect(await callStructured(model, request, schema, signal(), { beforeRequest })).toEqual({ ok: true, value: { text: "ok" }, usage: { promptTokens: 8, outputTokens: 4 } })
    expect(beforeRequest).toHaveBeenCalledTimes(2)
    expect(model.stream).toHaveBeenCalledWith(expect.objectContaining({ tools: [], responseSchema: z.toJSONSchema(schema), thinking: false }), expect.any(AbortSignal))
  })
  it("repairs at most once", async () => {
    const model = provider([[{ type: "text", delta: "{}" }, done], [{ type: "text", delta: "{}" }, done]])
    expect(await callStructured(model, request, schema, signal())).toMatchObject({ ok: false, reason: "parse" })
    expect(model.stream).toHaveBeenCalledTimes(2)
  })
  it.each(["length", "tool_calls"] as const)("rejects %s without repair", async (reason) => {
    const model = provider([[{ type: "text", delta: '{"text":"ok"}' }, { type: "done", reason }]])
    expect(await callStructured(model, request, schema, signal())).toMatchObject({ ok: false, reason: reason === "length" ? "length" : "provider" })
    expect(model.stream).toHaveBeenCalledOnce()
  })
  it("rejects missing completion and oversized responses", async () => {
    expect(await callStructured(provider([[{ type: "text", delta: '{"text":"ok"}' }]]), request, schema, signal())).toMatchObject({ ok: false, reason: "provider" })
    expect(await callStructured(provider([[{ type: "text", delta: "x".repeat(65537) }, done]]), request, schema, signal())).toMatchObject({ ok: false, reason: "length" })
  })
  it("cancels even when a provider ignores the signal", async () => {
    const controller = new AbortController()
    const model = provider([])
    model.stream = () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) })
    const running = callStructured(model, request, schema, controller.signal)
    controller.abort(new DOMException("cancel", "AbortError"))
    await expect(running).rejects.toMatchObject({ name: "AbortError" })
  })
})

it("does not call the provider when the request budget hook fails", async () => {
  const model = provider([])
  await expect(callStructured(model, request, schema, signal(), { beforeRequest: async () => { throw new Error("budget exceeded") } })).rejects.toThrow("budget exceeded")
  expect(model.stream).not.toHaveBeenCalled()
})

it("rejects actual tool events even if the model later stops", async () => {
  const model = provider([[{ type: "tool_call", call: { callId: "1", name: "t", args: {} } }, done]])
  expect(await callStructured(model, request, schema, signal())).toMatchObject({ ok: false, reason: "provider" })
})

it.each(["```json\n{\"text\":\"ok\"}\n```", "```\n{\"text\":\"ok\"}\n```"])("accepts one complete JSON fence without a repair", async (text) => {
  const model = provider([[{ type: "text", delta: text }, done]])
  expect(await callStructured(model, request, schema, signal())).toMatchObject({ ok: true, value: { text: "ok" } })
  expect(model.stream).toHaveBeenCalledOnce()
})

it("rejects prose outside a JSON fence", async () => {
  const response: ModelEvent[] = [{ type: "text", delta: 'Here is the answer:\n```json\n{"text":"ok"}\n```' }, done]
  const model = provider([response, response])
  expect(await callStructured(model, request, schema, signal())).toMatchObject({ ok: false, reason: "parse" })
})
