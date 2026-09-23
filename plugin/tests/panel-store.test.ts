import { describe, expect, it } from "vitest"

import type { RunEvent, RunId } from "../src/harness/events"
import { INITIAL_PANEL_STATE, reduce } from "../src/ui/state/panel-store"

const runId = "run-0001" as RunId

function apply(events: RunEvent[]) {
  return events.reduce(reduce, INITIAL_PANEL_STATE)
}

describe("panel store", () => {
  it("keeps tool activity out of the answer prose", () => {
    // PRODUCT.md criterion 5: tool activity never becomes assistant text.
    const state = apply([
      { type: "text", runId, delta: "The note says " },
      { type: "tool_call", runId, callId: "c1", tool: "search_vault", args: {} },
      { type: "text", runId, delta: "that it does." },
    ])
    expect(state.answer).toBe("The note says that it does.")
    expect(state.activity).toHaveLength(1)
  })

  it("shows one row per tool call, updated in place", () => {
    const state = apply([
      { type: "tool_call", runId, callId: "c1", tool: "read_note", args: {} },
      { type: "tool_result", runId, callId: "c1", summary: "3 matches", truncated: false },
    ])
    expect(state.activity).toEqual([
      { callId: "c1", tool: "read_note", status: "done", detail: "3 matches" },
    ])
  })

  it("keeps an error visible through the rest of the run", () => {
    const state = apply([
      { type: "error", runId, message: "Provider unreachable.", recoverable: true },
      { type: "state", runId, state: "failed" },
    ])
    expect(state.error).toBe("Provider unreachable.")
  })

  it("clears the previous answer only when a new run starts", () => {
    const state = apply([
      { type: "text", runId, delta: "old" },
      { type: "state", runId, state: "complete" },
      { type: "state", runId, state: "preparing_context" },
    ])
    expect(state.answer).toBe("")
    expect(state.error).toBeNull()
  })
})
