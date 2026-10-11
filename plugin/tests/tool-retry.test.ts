import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent, RunId } from "../src/harness/events"
import { runAgentLoop } from "../src/harness/agent-loop"
import type { RunInput } from "../src/harness/harness"
import type { ModelEvent, ModelProvider, RequestCounter } from "../src/providers/types"
import { ToolRegistry } from "../src/tools/registry"

const input: RunInput = {
  question: "q",
  packet: {
    systemInstructions: "s",
    currentNote: null,
    style: null,
    researchTopic: null,
    evidence: [],
    conversation: [],
    omitted: [],
  },
}
const counter: RequestCounter = { count: vi.fn(async () => ({ promptTokens: 1, method: "exact" as const })) }

function scripted(rounds: readonly (readonly ModelEvent[])[]): ModelProvider {
  let round = 0
  return {
    id: "scripted",
    health: async () => ({ reachable: true, detail: "ok" }),
    listModels: async () => [],
    stream: () => {
      const events = rounds[round++] ?? [{ type: "done", reason: "stop" } as const]
      return (async function* () {
        for (const event of events) yield event
      })()
    },
  }
}

function registryWith(run: () => Promise<{ value: string }>): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register({
    name: "slow",
    description: "slow",
    input: z.object({}).strict(),
    output: z.object({ value: z.string() }),
    parameters: { type: "object", properties: {}, additionalProperties: false },
    capability: "ask_user",
    approval: "never",
    timeoutMs: 10,
    resultBudgetTokens: 100,
    provenance: () => [],
    run,
  })
  return registry
}

async function collect(tools: ToolRegistry): Promise<RunEvent[]> {
  const provider = scripted([
    [{ type: "tool_call", call: { callId: "c1", name: "slow", args: {} } }, { type: "done", reason: "tool_calls" }],
    [{ type: "done", reason: "stop" }],
  ])
  const events: RunEvent[] = []
  for await (const event of runAgentLoop(
    "run-test" as RunId,
    input,
    { provider, model: "m", tools, limits: PROPOSED_LIMITS, counter, permissions: () => ({ networkResearchEnabled: false }) },
    new AbortController().signal
  )) {
    events.push(event)
  }
  return events
}

const hang = () => new Promise<{ value: string }>(() => {})

describe("tool retry", () => {
  it("retries a timed-out call once and uses the second result", async () => {
    const run = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce({ value: "ok" })
    const events = await collect(registryWith(run))
    expect(run).toHaveBeenCalledTimes(2)
    expect(events.some((e) => e.type === "tool_result")).toBe(true)
    expect(events.some((e) => e.type === "tool_failed")).toBe(false)
  })

  it("gives up after the retry budget and fails the run", async () => {
    const run = vi.fn(hang)
    const events = await collect(registryWith(run))
    expect(run).toHaveBeenCalledTimes(2)
    expect(events.filter((e) => e.type === "tool_failed")).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: "run_completed", outcome: "failed" })
  })

  it("does not retry other failures", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom"))
    await collect(registryWith(run))
    expect(run).toHaveBeenCalledTimes(1)
  })
})
