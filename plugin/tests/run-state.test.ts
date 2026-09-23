import { describe, expect, it } from "vitest"

import {
  IllegalTransitionError,
  type RunState,
  isActive,
  isTerminal,
  sendSlot,
  transition,
} from "../src/harness/run-state"

const TERMINAL: RunState[] = ["complete", "incomplete", "cancelled", "failed"]

describe("run state", () => {
  it("treats every terminal outcome as terminal, not as loading", () => {
    for (const state of TERMINAL) {
      expect(isTerminal(state)).toBe(true)
      expect(isActive(state)).toBe(false)
    }
  })

  it("returns the composer to a send slot from every terminal outcome", () => {
    // ARCHITECTURE.md: terminal outcomes cannot permanently disable input.
    for (const state of TERMINAL) {
      expect(sendSlot(state)).toBe("send")
    }
    expect(sendSlot("idle")).toBe("send")
    expect(sendSlot("streaming")).toBe("stop")
  })

  it("lets every terminal outcome start a new run", () => {
    for (const state of TERMINAL) {
      expect(transition(state, "preparing_context")).toBe("preparing_context")
    }
  })

  it("refuses a transition that is not declared", () => {
    expect(() => transition("idle", "streaming")).toThrow(IllegalTransitionError)
    expect(() => transition("complete", "streaming")).toThrow(IllegalTransitionError)
  })

  it("allows cancellation from every active state", () => {
    const active: RunState[] = [
      "preparing_context",
      "waiting_for_model",
      "streaming",
      "waiting_for_tool_approval",
      "executing_tool",
      "preparing_answer",
    ]
    for (const state of active) {
      expect(transition(state, "cancelled")).toBe("cancelled")
    }
  })
})
