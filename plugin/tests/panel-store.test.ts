import { describe, expect, it } from "vitest"

import type { RunEvent, RunId } from "../src/harness/events"
import { INITIAL_PANEL_STATE, reduce } from "../src/ui/state/panel-store"

const runId = "run-0001" as RunId

function apply(events: RunEvent[]) {
  return events.reduce(reduce, INITIAL_PANEL_STATE)
}

describe("panel store", () => {
  it("only clears the currently pending question and resets workflow state for a new run", () => {
    const pending = apply([
      { type: "workflow_phase", runId, phase: "explore" },
      { type: "question_requested", runId, questionId: "q1", question: "역할은?" },
      { type: "question_answered", runId, questionId: "old", answerId: "a0", answer: "무시" },
    ])
    expect(pending.pendingQuestion?.questionId).toBe("q1")
    const answered = reduce(pending, {
      type: "question_answered", runId, questionId: "q1", answerId: "a1", answer: "지원",
    })
    expect(answered.pendingQuestion).toBeNull()
    expect(answered.answer).toBe("")
    const next = reduce(pending, { type: "run_started", runId, question: "새 요청", currentNote: null })
    expect(next.pendingQuestion).toBeNull()
    expect(next.phase).toBeNull()
  })

  it("displays the verified draft and removes an incomplete draft", () => {
    const verified = apply([
      { type: "verified_draft", runId, text: "확인된 글", target: null, issues: ["의미 검증도 오류 가능"] },
      { type: "text", runId, delta: "확인된 글" },
    ])
    expect(verified.answer).toBe("확인된 글")
    expect(verified.verified).toBe(true)
    expect(verified.verificationIssues).toEqual(["의미 검증도 오류 가능"])
    const incomplete = reduce(verified, { type: "workflow_incomplete", runId, message: "근거 부족" })
    expect(incomplete.answer).toBe("")
    expect(incomplete.verified).toBe(false)
    expect(incomplete.error).toBe("근거 부족")
  })

  it("captures the run model and clears questions on cancellation", () => {
    const cancelled = apply([
      { type: "run_started", runId, question: "요청", currentNote: null, model: "selected-model" },
      { type: "question_requested", runId, questionId: "q1", question: "역할은?" },
      { type: "state", runId, state: "cancelled" },
    ])
    expect(cancelled.model).toBe("selected-model")
    expect(cancelled.pendingQuestion).toBeNull()
    const next = reduce(cancelled, { type: "run_started", runId, question: "새 요청", currentNote: null })
    expect(next.model).toBeNull()
  })

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

  it("clears the previous answer only when run_started arrives", () => {
    const state = apply([
      { type: "text", runId, delta: "old" },
      { type: "state", runId, state: "complete" },
      { type: "run_started", runId, question: "new", currentNote: null },
    ])
    expect(state.answer).toBe("")
    expect(state.error).toBeNull()
  })

  it("keeps the captured question and note through preparing_context", () => {
    const note = { path: "A.md", title: "A", text: "selected", isSelection: true }
    const state = apply([
      { type: "run_started", runId, question: "질문", currentNote: note },
      { type: "state", runId, state: "preparing_context" },
    ])
    expect(state.question).toBe("질문")
    expect(state.currentNote).toEqual(note)
  })
})
