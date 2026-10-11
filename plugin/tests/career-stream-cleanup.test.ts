import { describe, expect, it, vi } from "vitest"
import { runCareerWorkflow } from "../src/workflow/career-graph"
import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent, RunId } from "../src/harness/events"
import type { RunInput } from "../src/harness/run-input"
import type { ModelEvent, ModelProvider, RequestCounter } from "../src/providers/types"
import { createToolRegistry } from "../src/tools/create-registry"

const input: RunInput = {
  mode: "career",
  question: "협업 경험에 관한 새 글을 작성해줘",
  packet: { systemInstructions: "", currentNote: null, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] },
}
const analysis = { intent: "draft", applicationQuestion: "협업한 경험을 설명하세요", criteria: "", query: "협업", requiredFacts: ["본인 행동"] }

function setup(next: (signal: AbortSignal) => Promise<IteratorResult<ModelEvent>>, counter: RequestCounter = { count: async () => ({ promptTokens: 100, method: "exact" }) }) {
  let explorerSignal: AbortSignal | undefined
  let calls = 0
  const close = vi.fn(async (): Promise<IteratorResult<ModelEvent>> => ({ done: true, value: undefined }))
  const provider: ModelProvider = {
    id: "scripted",
    health: async () => ({ reachable: true, detail: "ok" }),
    listModels: async () => [],
    stream: vi.fn((_request, signal) => {
      if (++calls === 1) {
        return { [Symbol.asyncIterator]: async function* () {
          yield { type: "text" as const, delta: JSON.stringify(analysis) }
          yield { type: "done" as const, reason: "stop" as const }
        } }
      }
      explorerSignal = signal
      return { [Symbol.asyncIterator]: () => ({ next: () => next(signal), return: close }) }
    }),
  }
  const tools = createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" })
  const events: RunEvent[] = []
  const collect = async (signal: AbortSignal) => {
    for await (const event of runCareerWorkflow("run-cleanup" as RunId, input, { provider, model: "scripted", tools, counter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }), waitForUser: async () => { throw new Error("Unexpected question") } }, signal)) events.push(event)
    return events
  }
  return { provider, collect, close, events, explorerSignal: () => explorerSignal }
}

describe("career native exploration stream cleanup", () => {
  it("closes and aborts an oversized stream before a draft is exposed", async () => {
    const run = setup(async () => ({ done: false, value: { type: "text", delta: "x".repeat(65_537) } }))
    await run.collect(new AbortController().signal)
    expect(run.close).toHaveBeenCalledOnce()
    expect(run.explorerSignal()?.aborted).toBe(true)
    expect(run.events.some(event => event.type === "verified_draft")).toBe(false)
    expect(run.events.find(event => event.type === "run_completed")).toMatchObject({ outcome: "incomplete" })
  })

  it("closes and aborts an EOF stream without treating it as completion", async () => {
    const run = setup(async () => ({ done: true, value: undefined }))
    await run.collect(new AbortController().signal)
    expect(run.close).toHaveBeenCalledOnce()
    expect(run.explorerSignal()?.aborted).toBe(true)
    expect(run.events.some(event => event.type === "verified_draft")).toBe(false)
    expect(run.events.find(event => event.type === "run_completed")).toMatchObject({ outcome: "incomplete" })
  })

  it("closes a hanging iterator that ignores cancellation", async () => {
    const controller = new AbortController()
    const run = setup(() => {
      controller.abort(new DOMException("cancel", "AbortError"))
      return new Promise(() => {})
    })
    await expect(run.collect(controller.signal)).rejects.toMatchObject({ name: "AbortError" })
    expect(run.close).toHaveBeenCalledOnce()
    expect(run.explorerSignal()?.aborted).toBe(true)
    expect(run.events.some(event => event.type === "verified_draft")).toBe(false)
  })

  it("never opens the exploration stream when the final request budget fails", async () => {
    let counts = 0
    const counter: RequestCounter = { count: async () => ({ promptTokens: ++counts === 1 ? 100 : 7000, method: "exact" }) }
    const run = setup(async () => { throw new Error("Unexpected stream") }, counter)
    await run.collect(new AbortController().signal)
    expect(run.provider.stream).toHaveBeenCalledOnce()
    expect(run.close).not.toHaveBeenCalled()
    expect(run.events.some(event => event.type === "verified_draft")).toBe(false)
    expect(run.events.find(event => event.type === "workflow_incomplete")).toMatchObject({ message: expect.stringContaining("budget") })
  })
})
