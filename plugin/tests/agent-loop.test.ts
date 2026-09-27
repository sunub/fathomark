import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent, RunId } from "../src/harness/events"
import { runAgentLoop } from "../src/harness/langchain-loop"
import { executeTool } from "../src/harness/tool-executor"
import type { RunInput } from "../src/harness/harness"
import type { ModelEvent, ModelProvider, ModelRequest, RequestCounter } from "../src/providers/types"
import { ToolRegistry } from "../src/tools/registry"

const runId = "run-test" as RunId
const input: RunInput = {
  question: "question",
  packet: {
    systemInstructions: "system",
    currentNote: null,
    style: null,
    researchTopic: null,
    evidence: [],
    conversation: [],
    omitted: [],
  },
}
const counter: RequestCounter = {
  count: vi.fn(async () => ({ promptTokens: 100, method: "exact" as const })),
}

function scripted(rounds: readonly (readonly ModelEvent[])[]): ModelProvider & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = []
  return {
    id: "scripted",
    requests,
    health: async () => ({ reachable: true, detail: "ok" }),
    listModels: async () => [],
    stream: (request) => {
      requests.push(request)
      const events = rounds[requests.length - 1] ?? []
      return (async function* () {
        for (const event of events) yield event
      })()
    },
  }
}

function addTool(
  registry: ToolRegistry,
  name: string,
  run = vi.fn(async ({ value }: { value: string }) => ({ value }))
) {
  registry.register({
    name,
    description: name,
    input: z.object({ value: z.string() }).strict(),
    output: z.object({ value: z.string() }),
    parameters: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    },
    capability: "read_note",
    approval: "never",
    timeoutMs: 100,
    resultBudgetTokens: 100,
    provenance: () => [],
    run,
  })
  return run
}

async function collect(
  provider: ModelProvider,
  tools: ToolRegistry,
  permissions = () => ({ networkResearchEnabled: false })
): Promise<RunEvent[]> {
  const events: RunEvent[] = []
  for await (const event of runAgentLoop(
    runId,
    input,
    { provider, model: "m", tools, limits: PROPOSED_LIMITS, counter, permissions },
    new AbortController().signal
  )) {
    events.push(event)
  }
  return events
}

describe("agent loop", () => {
  it("drops a successful result returned after the tool timeout", async () => {
    const tools = new ToolRegistry()
    tools.register({
      name: "slow",
      description: "slow",
      input: z.object({}).strict(),
      output: z.object({ ok: z.literal(true) }),
      parameters: { type: "object", properties: {}, additionalProperties: false },
      capability: "read_note",
      approval: "never",
      timeoutMs: 5,
      resultBudgetTokens: 10,
      provenance: () => [],
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return { ok: true as const }
      },
    })
    const toolContext = {
      signal: new AbortController().signal,
      researchTopic: null,
      allowedWikipediaPages: new Set<string>(),
      permissions: () => ({ networkResearchEnabled: false }),
      onResearchQuery: () => {},
    }

    await expect(
      executeTool(
        { callId: "slow-1", name: "slow", args: {} },
        tools,
        () => ({ networkResearchEnabled: false }),
        toolContext
      )
    ).rejects.toThrow(/timed out/i)
  })
  it("does not execute schema-invalid input and allows only one repair round", async () => {
    const provider = scripted([
      [
        { type: "tool_call", call: { callId: "c1", name: "read", args: {} } },
        { type: "done", reason: "tool_calls" },
      ],
      [
        { type: "tool_call", call: { callId: "c2", name: "read", args: {} } },
        { type: "done", reason: "tool_calls" },
      ],
    ])
    const tools = new ToolRegistry()
    const run = addTool(tools, "read")

    const events = await collect(provider, tools)

    expect(run).not.toHaveBeenCalled()
    expect(provider.requests).toHaveLength(2)
    expect(events.filter((event) => event.type === "tool_failed")).toHaveLength(2)
  })

  it("executes a duplicate call id only once", async () => {
    const provider = scripted([
      [
        { type: "tool_call", call: { callId: "same", name: "read", args: { value: "a" } } },
        { type: "tool_call", call: { callId: "same", name: "read", args: { value: "a" } } },
        { type: "done", reason: "tool_calls" },
      ],
      [{ type: "done", reason: "stop" }],
    ])
    const tools = new ToolRegistry()
    const run = addTool(tools, "read")

    await collect(provider, tools)

    expect(run).toHaveBeenCalledOnce()
  })

  it("refuses the sixth call for one tool before a second model request", async () => {
    const calls = Array.from({ length: 6 }, (_, index) => ({
      type: "tool_call" as const,
      call: { callId: `c${index}`, name: "read", args: { value: String(index) } },
    }))
    const provider = scripted([[...calls, { type: "done", reason: "tool_calls" }]])
    const tools = new ToolRegistry()
    const run = addTool(tools, "read")

    await collect(provider, tools)

    expect(run).toHaveBeenCalledTimes(5)
    expect(provider.requests).toHaveLength(1)
  })

  it("refuses the thirteenth total call before a second model request", async () => {
    const tools = new ToolRegistry()
    const runs = [addTool(tools, "a"), addTool(tools, "b"), addTool(tools, "c")]
    const calls = Array.from({ length: 13 }, (_, index) => ({
      type: "tool_call" as const,
      call: { callId: `c${index}`, name: ["a", "b", "c"][index % 3]!, args: { value: String(index) } },
    }))
    const provider = scripted([[...calls, { type: "done", reason: "tool_calls" }]])

    await collect(provider, tools)

    expect(runs.reduce((total, run) => total + run.mock.calls.length, 0)).toBe(12)
    expect(provider.requests).toHaveLength(1)
  })

  it("never transmits a ninth model request", async () => {
    const rounds = Array.from({ length: 9 }, (_, index) => [
      { type: "tool_call" as const, call: { callId: `c${index}`, name: ["a", "b", "c"][index % 3]!, args: { value: String(index) } } },
      { type: "done" as const, reason: "tool_calls" as const },
    ])
    const provider = scripted(rounds)
    const tools = new ToolRegistry()
    addTool(tools, "a")
    addTool(tools, "b")
    addTool(tools, "c")

    await collect(provider, tools)

    expect(provider.requests).toHaveLength(8)
  })

  it("rechecks permission immediately before a network tool runs", async () => {
    const provider = scripted([
      [
        { type: "tool_call", call: { callId: "c1", name: "wiki", args: { value: "topic" } } },
        { type: "done", reason: "tool_calls" },
      ],
      [{ type: "done", reason: "stop" }],
    ])
    const tools = new ToolRegistry()
    const run = vi.fn(async ({ value }: { value: string }) => ({ value }))
    tools.register({
      name: "wiki",
      description: "wiki",
      input: z.object({ value: z.string() }).strict(),
      output: z.object({ value: z.string() }),
      parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false },
      capability: "wikipedia",
      approval: "never",
      timeoutMs: 100,
      resultBudgetTokens: 100,
      provenance: () => [],
      run,
    })

    await collect(provider, tools, () => ({ networkResearchEnabled: false }))

    expect(run).not.toHaveBeenCalled()
  })

  it("preserves a length completion as an incomplete loop outcome", async () => {
    const provider = scripted([
      [
        { type: "text", delta: "partial" },
        { type: "done", reason: "length" },
      ],
    ])

    const events = await collect(provider, new ToolRegistry())

    expect(events).toContainEqual({
      type: "run_completed",
      runId,
      outcome: "incomplete",
      reason: "length",
    })
  })

  it("rejects an invalid tool result", async () => {
    const provider = scripted([
      [
        { type: "tool_call", call: { callId: "c1", name: "read", args: { value: "a" } } },
        { type: "done", reason: "tool_calls" },
      ],
    ])
    const tools = new ToolRegistry()
    addTool(tools, "read", vi.fn(async () => ({ wrong: true })) as never)

    const events = await collect(provider, tools)

    expect(events).toContainEqual(expect.objectContaining({ type: "tool_failed", callId: "c1" }))
    expect(provider.requests).toHaveLength(1)
  })
})
