import { describe, expect, it } from "vitest"

import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent } from "../src/harness/events"
import { AgentHarness } from "../src/harness/harness"
import { FakeModelProvider } from "../src/providers/fake"
import type { ModelProvider } from "../src/providers/types"
import { ToolRegistry } from "../src/tools/registry"

function harness(provider: FakeModelProvider) {
  return new AgentHarness({
    provider,
    tools: new ToolRegistry(),
    limits: PROPOSED_LIMITS,
    permissions: { networkResearchEnabled: false },
    model: "fake",
  })
}

const packet = {
  systemInstructions: "test",
  currentNote: null,
  style: null,
  researchTopic: null,
  evidence: [],
  conversation: [],
  omitted: [],
} as const

describe("agent harness", () => {
  it("length is incomplete", async () => {
    const provider: ModelProvider = {
      id: "length",
      health: async () => ({ reachable: true, detail: "ok" }),
      listModels: async () => [],
      stream: async function* () {
        yield { type: "text", delta: "partial" }
        yield { type: "done", reason: "length" }
      },
    }
    const agent = new AgentHarness({
      provider,
      tools: new ToolRegistry(),
      limits: PROPOSED_LIMITS,
      permissions: { networkResearchEnabled: false },
      model: "length",
    })

    await agent.run({ question: "hello", packet })

    expect(agent.currentState()).toBe("incomplete")
  })

  it("EOF without done fails", async () => {
    const provider: ModelProvider = {
      id: "eof",
      health: async () => ({ reachable: true, detail: "ok" }),
      listModels: async () => [],
      stream: async function* () {
        yield { type: "text", delta: "orphan" }
      },
    }
    const agent = new AgentHarness({
      provider,
      tools: new ToolRegistry(),
      limits: PROPOSED_LIMITS,
      permissions: { networkResearchEnabled: false },
      model: "eof",
    })
    const events: RunEvent[] = []
    agent.subscribe((event) => events.push(event))

    await agent.run({ question: "hello", packet })

    expect(events.find((event) => event.type === "error")).toMatchObject({
      message: "The model stream ended without a completion event.",
    })
    expect(agent.currentState()).toBe("failed")
  })

  it("timeout remains input ready", async () => {
    let attempts = 0
    const provider: ModelProvider = {
      id: "timeout",
      health: async () => ({ reachable: true, detail: "ok" }),
      listModels: async () => [],
      stream: (_request, signal) =>
        (async function* () {
          attempts += 1
          if (attempts > 1) {
            yield { type: "done", reason: "stop" }
            return
          }
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true })
          })
        })(),
    }
    const agent = new AgentHarness({
      provider,
      tools: new ToolRegistry(),
      limits: PROPOSED_LIMITS,
      permissions: { networkResearchEnabled: false },
      model: "timeout",
      runTimeoutMs: 20,
    })
    const events: RunEvent[] = []
    agent.subscribe((event) => events.push(event))

    await agent.run({ question: "hello", packet })

    expect(events.find((event) => event.type === "error")).toMatchObject({
      message: "The run timed out after 20ms.",
    })
    expect(agent.currentState()).toBe("failed")
    await agent.run({ question: "again", packet })
    expect(agent.currentState()).toBe("complete")
  })

  it("timeout stops waiting for a provider that ignores abort", async () => {
    const provider: ModelProvider = {
      id: "ignores-abort",
      health: async () => ({ reachable: true, detail: "ok" }),
      listModels: async () => [],
      stream: () =>
        (async function* () {
          await new Promise(() => {})
        })(),
    }
    const agent = new AgentHarness({
      provider,
      tools: new ToolRegistry(),
      limits: PROPOSED_LIMITS,
      permissions: { networkResearchEnabled: false },
      model: "timeout",
      runTimeoutMs: 10,
    })

    await expect(agent.run({ question: "hello", packet })).resolves.toBeUndefined()
    expect(agent.currentState()).toBe("failed")
  })

  it("streams a fake response through the run states and ends complete", async () => {
    const agent = harness(new FakeModelProvider({ chunks: ["a", "b"] }))
    const events: RunEvent[] = []
    agent.subscribe((event) => events.push(event))

    await agent.run({ question: "hello", packet })

    const states = events.filter((e) => e.type === "state").map((e) => e.state)
    expect(states).toEqual([
      "preparing_context",
      "waiting_for_model",
      "streaming",
      "preparing_answer",
      "complete",
    ])
    expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toBe("ab")
    expect(agent.currentState()).toBe("complete")
  })

  it("ends cancelled, not failed, when the user stops it", async () => {
    const agent = harness(new FakeModelProvider({ chunks: ["a", "b", "c"], chunkDelayMs: 20 }))
    const events: RunEvent[] = []
    agent.subscribe((event) => events.push(event))

    const running = agent.run({ question: "hello", packet })
    await new Promise((resolve) => setTimeout(resolve, 10))
    agent.cancel()
    await running

    expect(agent.currentState()).toBe("cancelled")
    // A stop the user asked for is an outcome, never a red error row.
    expect(events.some((e) => e.type === "error")).toBe(false)
  })

  it("reports a provider failure as an error the user can act on, and stays recoverable", async () => {
    const provider = new FakeModelProvider({ chunks: ["ok"] })
    const working = provider.stream.bind(provider)
    let firstCall = true
    // Fails once, then works: the point of the test is that a failed run leaves
    // the harness able to start another, not that the provider stays broken.
    provider.stream = function (request, signal) {
      if (firstCall) {
        firstCall = false
        return (async function* () {
          throw new Error("Provider unreachable.")
        })()
      }
      return working(request, signal)
    }
    const agent = harness(provider)
    const events: RunEvent[] = []
    agent.subscribe((event) => events.push(event))

    await agent.run({ question: "hello", packet })

    const error = events.find((e) => e.type === "error")
    expect(error).toMatchObject({ message: "Provider unreachable.", recoverable: true })
    expect(agent.currentState()).toBe("failed")
    // And a failed run can still start another one.
    await agent.run({ question: "again", packet })
    expect(agent.currentState()).toBe("complete")
  })

  it("releases every listener on dispose, so unload leaks nothing", async () => {
    const agent = harness(new FakeModelProvider({ chunks: ["a"], chunkDelayMs: 20 }))
    let received = 0
    agent.subscribe(() => received++)

    const running = agent.run({ question: "hello", packet })
    agent.dispose()
    await running

    const afterDispose = received
    await agent.run({ question: "again", packet }).catch(() => {})
    expect(received).toBe(afterDispose)
  })

  it("refuses to start a second run while one is active", async () => {
    const agent = harness(new FakeModelProvider({ chunks: ["a"], chunkDelayMs: 30 }))
    const first = agent.run({ question: "one", packet })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await expect(agent.run({ question: "two", packet })).rejects.toThrow(/already active/)
    agent.cancel()
    await first
  })
})
