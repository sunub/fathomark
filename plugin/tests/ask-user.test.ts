import { describe, expect, it } from "vitest"

import { estimateTokens } from "../src/context/local-counter"
import { decide } from "../src/harness/policy"
import { executeTool } from "../src/harness/tool-executor"
import { registerAskUserTool } from "../src/tools/ask-user"
import { ToolRegistry } from "../src/tools/registry"
import type { ToolExecutionContext } from "../src/tools/registry"

function context(signal = new AbortController().signal): ToolExecutionContext {
  return {
    signal,
    researchTopic: null,
    allowedWikipediaPages: new Set(),
    permissions: () => ({ networkResearchEnabled: false }),
    onResearchQuery: () => {},
  }
}

function tool() {
  const registry = new ToolRegistry()
  registerAskUserTool(registry)
  return registry.get("ask_user")!
}

describe("ask_user", () => {
  it("returns the request at once instead of waiting for an answer", async () => {
    const input = { missing: "your role in the migration", question: "Did you lead it or join it?" }
    const output = await tool().run(input as never, context())

    expect(output).toEqual({ status: "question_requested", request: input })
    expect(tool().output.safeParse(output).success).toBe(true)
  })

  it("is allowed without approval and cites nothing", () => {
    expect(decide(tool().capability, { networkResearchEnabled: false })).toEqual({
      allowed: true,
      requiresApproval: false,
    })
    expect(tool().provenance({ status: "question_requested", request: {} } as never)).toEqual([])
  })

  it.each([
    ["no question", { missing: "x" }],
    ["a model-chosen run ID", { missing: "x", question: "y", runId: "r1" }],
    ["one option", { missing: "x", question: "y", options: ["only"] }],
    ["five options", { missing: "x", question: "y", options: ["a", "b", "c", "d", "e"] }],
    ["an over-long question", { missing: "x", question: "y".repeat(301) }],
    ["a malformed source ID", { missing: "x", question: "y", relatedSourceIds: ["note.md"] }],
  ])("rejects %s", (_name, input) => {
    expect(tool().input.safeParse(input).success).toBe(false)
  })

  it("does not run once the signal is aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      tool().run({ missing: "x", question: "y" } as never, context(controller.signal))
    ).rejects.toThrow()
  })
})

it("fits the longest valid Korean request inside its own result budget", async () => {
  const registry = new ToolRegistry()
  registerAskUserTool(registry)
  const input = { missing: "가".repeat(200), question: "나".repeat(300), options: ["다".repeat(100), "라".repeat(100), "마".repeat(100), "바".repeat(100)], relatedSourceIds: ["S10", "S11", "S12", "S13", "S14"] }
  const result = await executeTool({ callId: "c1", name: "ask_user", args: input }, registry, () => ({ networkResearchEnabled: false }), { ...context(), countResultTokens: estimateTokens })
  expect(JSON.parse(result.content)).toMatchObject({ status: "question_requested" })
})
