import { describe, expect, it } from "vitest"

import { PROPOSED_LIMITS } from "../src/harness/budget"
import { AgentHarness } from "../src/harness/harness"
import { RunSession } from "../src/harness/session"
import { FakeModelProvider } from "../src/providers/fake"
import { ToolRegistry } from "../src/tools/registry"

const packet = {
  systemInstructions: "test",
  currentNote: null,
  style: null,
  researchTopic: null,
  evidence: [],
  conversation: [],
  omitted: [],
} as const

function createHarness(provider = new FakeModelProvider({ chunks: ["a", "b"] })) {
  return new AgentHarness({
    provider,
    tools: new ToolRegistry(),
    limits: PROPOSED_LIMITS,
    permissions: { networkResearchEnabled: false },
    model: "fake",
  })
}

describe("run session", () => {
  it("reopen reads full snapshot", async () => {
    const harness = createHarness()
    const session = new RunSession(harness)

    await harness.run({ question: "hello", packet })

    expect(
      session
        .getSnapshot()
        .events.filter((event) => event.type === "text")
        .map((event) => event.delta)
    ).toEqual(["ab"])
    expect(session.history()).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "ab" },
    ])
  })

  it("busy run does not mutate active question", async () => {
    const harness = createHarness(new FakeModelProvider({ chunks: ["a"], chunkDelayMs: 30 }))
    const session = new RunSession(harness)
    const first = harness.run({ question: "one", packet })

    await expect(harness.run({ question: "two", packet })).rejects.toThrow(/already active/)
    expect(session.getSnapshot().events.find((event) => event.type === "run_started")).toMatchObject({
      question: "one",
    })
    harness.cancel()
    await first
  })

  it("dispose drops late output", async () => {
    const harness = createHarness(
      new FakeModelProvider({ chunks: ["a", "b"], firstEventDelayMs: 10, chunkDelayMs: 10 })
    )
    const session = new RunSession(harness)
    const running = harness.run({ question: "hello", packet })
    const before = session.getSnapshot()

    session.dispose()
    await running

    expect(session.getSnapshot()).toBe(before)
  })

  it("keeps the draft and request target outside a closed view", () => {
    const harness = createHarness()
    const session = new RunSession(harness)
    const target = {
      id: "target-1",
      path: "A.md",
      text: "body",
      selection: "body",
      from: { line: 0, ch: 0 },
      to: { line: 0, ch: 4 },
    }
    const request = { question: "q", packet }

    session.setDraft("다음 질문")
    session.rememberRequest(request, target)

    expect(session.getSnapshot().draft).toBe("다음 질문")
    expect(session.lastRequest()).toEqual({ input: request, target })
  })
})
