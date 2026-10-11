import { describe, expect, it } from "vitest"
import { z } from "zod"

import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent } from "../src/harness/events"
import { AgentHarness, type RunInput } from "../src/harness/harness"
import { fakeRequestCounter } from "../src/providers/fake"
import type {
  ModelEvent,
  ModelProvider,
  ModelRequest,
  RequestCounter,
} from "../src/providers/types"
import { ToolRegistry } from "../src/tools/registry"

function scripted(
  rounds: readonly (readonly ModelEvent[])[]
): ModelProvider & { requests: ModelRequest[] } {
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

const states = (events: readonly RunEvent[]) =>
  events.filter((e) => e.type === "state").map((e) => e.state)

function harnessWith(
  provider: ModelProvider,
  tools = new ToolRegistry(),
  counter: RequestCounter = fakeRequestCounter
) {
  const agent = new AgentHarness({
    provider,
    tools,
    limits: PROPOSED_LIMITS,
    permissions: () => ({ networkResearchEnabled: false }),
    model: "m",
    counter,
  })
  const events: RunEvent[] = []
  agent.subscribe((event) => events.push(event))
  return { agent, events }
}

const emptyPacket: RunInput["packet"] = {
  systemInstructions: "SYS",
  currentNote: null,
  style: null,
  researchTopic: null,
  evidence: [],
  conversation: [],
  omitted: [],
}

describe("harness running the agent loop", () => {
  it("sends the whole packet to the model, not just the question", async () => {
    const provider = scripted([[{ type: "text", delta: "ok" }, { type: "done", reason: "stop" }]])
    const { agent } = harnessWith(provider)

    await agent.run({
      question: "now?",
      packet: {
        ...emptyPacket,
        currentNote: { path: "a.md", title: "a", text: "NOTE-BODY", isSelection: false },
        style: { id: "style-1", text: "STYLE-SAMPLE" },
        conversation: [
          { role: "user", text: "before" },
          { role: "assistant", text: "earlier answer" },
        ],
      },
    })

    const request = provider.requests[0]
    expect(request?.messages[0]?.content).toContain("NOTE-BODY")
    expect(request?.messages[0]?.content).toContain("STYLE-SAMPLE")
    expect(request?.messages.slice(1)).toEqual([
      { role: "user", content: "before" },
      { role: "assistant", content: "earlier answer" },
      { role: "user", content: "now?" },
    ])
  })

  it("walks the run states for a text-only answer and hides the loop's own completion event", async () => {
    const provider = scripted([[{ type: "text", delta: "ok" }, { type: "done", reason: "stop" }]])
    const { agent, events } = harnessWith(provider)

    await agent.run({ question: "q", packet: emptyPacket })

    expect(states(events)).toEqual([
      "preparing_context",
      "waiting_for_model",
      "streaming",
      "preparing_answer",
      "complete",
    ])
    // The state event is the one completion signal the UI and RunSession read.
    expect(events.some((e) => e.type === "run_completed")).toBe(false)
  })

  it("executes a tool and continues to a second model round", async () => {
    const tools = new ToolRegistry()
    tools.register({
      name: "read",
      description: "read",
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
      run: async ({ value }) => ({ value }),
    })
    const provider = scripted([
      [
        { type: "tool_call", call: { callId: "c1", name: "read", args: { value: "x" } } },
        { type: "done", reason: "tool_calls" },
      ],
      [{ type: "text", delta: "done" }, { type: "done", reason: "stop" }],
    ])
    const { agent, events } = harnessWith(provider, tools)

    await agent.run({ question: "q", packet: emptyPacket })

    expect(states(events)).toEqual([
      "preparing_context",
      "waiting_for_model",
      "streaming", // a tool call with no prose first still passes through streaming
      "executing_tool",
      "waiting_for_model",
      "streaming",
      "preparing_answer",
      "complete",
    ])
    expect(events.filter((e) => e.type === "tool_call")).toHaveLength(1)
    expect(events.filter((e) => e.type === "tool_result")).toHaveLength(1)
    // The second model round sees the tool exchange, not just the question.
    const roles = provider.requests[1]?.messages.map((message) => message.role) ?? []
    expect(roles).toContain("tool")
    expect(roles.indexOf("assistant")).toBeLessThan(roles.indexOf("tool"))
  })

  it("fails with an actionable error when required content cannot fit the budget", async () => {
    const tooBig: RequestCounter = {
      count: async () => ({ promptTokens: 1_000_000, method: "exact" }),
    }
    const provider = scripted([[{ type: "done", reason: "stop" }]])
    const { agent, events } = harnessWith(provider, new ToolRegistry(), tooBig)

    await agent.run({ question: "q", packet: emptyPacket })

    expect(agent.currentState()).toBe("failed")
    expect(events.find((e) => e.type === "error")).toMatchObject({
      message: expect.stringMatching(/exceeds the verified token budget/),
      recoverable: true,
    })
    expect(provider.requests).toHaveLength(0)
  })
})
