import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { RunEvent, RunId, RunSnapshot } from "../src/harness/events"
import type { InsertionPreview } from "../src/context/insertion"
import { App } from "../src/ui/App"

const runId = "run-1" as RunId

afterEach(cleanup)

function snapshot(events: RunEvent[], state: RunSnapshot["state"] = "complete"): RunSnapshot {
  return { version: events.length, state, events }
}

function commands() {
  const previewBlockedReason = vi.fn<() => string | null>(() => null)
  const previewAnswer = vi.fn<(recapture?: boolean) => InsertionPreview | null>(() => null)
  const approveInsertion = vi.fn<(id: string) => InsertionPreview | null>(() => null)
  const discardInsertion = vi.fn<(id: string) => InsertionPreview | null>(() => null)
  return {
    ask: vi.fn(async () => ({ accepted: true })),
    stop: vi.fn(),
    retry: vi.fn(async () => ({ accepted: true })),
    openSource: vi.fn(async () => {}),
    setResearchTopic: vi.fn(),
    selectStyle: vi.fn(async () => {}),
    clearStyle: vi.fn(async () => {}),
    saveStyle: vi.fn(async () => {}),
    setDraft: vi.fn(),
    previewAnswer,
    previewBlockedReason,
    approveInsertion,
    discardInsertion,
  }
}

describe("app snapshot rendering", () => {
  it("uses the model captured for the run and maps the actual preview phase", () => {
    const current = snapshot([
      { type: "run_started", runId, question: "요청", currentNote: null, model: "captured-model" },
      { type: "workflow_phase", runId, phase: "preview" },
    ])
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={commands()} modelLabel="new-setting" />)
    expect(screen.getByText("captured-model")).toBeTruthy()
    expect(screen.queryByText("new-setting")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("검증된 초안 확인")
  })
  it("shows verified text and review limitations instead of exploratory output", () => {
    const current = snapshot([
      { type: "run_started", runId, question: "요청", currentNote: null },
      { type: "text", runId, delta: "중간 출력" },
      { type: "verified_draft", runId, text: "검증된 결과", target: null, issues: ["최종 확인 필요"] },
    ])
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={commands()} modelLabel="m" />)
    expect(screen.getByText("검증된 결과")).toBeTruthy()
    expect(screen.getByText("최종 확인 필요")).toBeTruthy()
    expect(screen.queryByText("중간 출력")).toBeNull()
  })

  it("shows user and pasted sources as excerpts without invented navigation", () => {
    const current = snapshot([
      { type: "evidence", runId, sourceId: "S1", reference: {
        kind: "user", runId, questionId: "q1", answerId: "a1", excerpt: "테스트 작성 지원",
      } },
      { type: "evidence", runId, sourceId: "S2", reference: {
        kind: "public", sourceId: "p1", title: "지원 공고", excerpt: "협업 역량", collectedAt: "2026-10-11",
      } },
    ])
    const appCommands = commands()
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={appCommands} modelLabel="m" />)
    expect(screen.getByText("테스트 작성 지원")).toBeTruthy()
    expect(screen.getByText(/사용자 보충 답변/)).toBeTruthy()
    expect(screen.getByText(/공개 참고 자료/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /지원 공고/ })).toBeNull()
    expect(appCommands.openSource).not.toHaveBeenCalled()
  })

  it("sends the pasted public material alongside the request", async () => {
    const appCommands = commands()
    const current = { ...snapshot([], "idle"), draft: "작성해주세요" }
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={appCommands} modelLabel="m" />)
    fireEvent.change(screen.getByRole("textbox", { name: "지원 공고 또는 문항 붙여넣기" }), {
      target: { value: " 공개 공고 " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await vi.waitFor(() => expect(appCommands.ask).toHaveBeenCalledWith("작성해주세요", "공개 공고"))
  })

  it("shows a supplementary question while waiting and forwards its answer", () => {
    const answerQuestion = vi.fn(() => ({ accepted: true }))
    const appCommands = { ...commands(), answerQuestion }
    const current = snapshot([
      { type: "run_started", runId, question: "요청", currentNote: null },
      { type: "state", runId, state: "waiting_for_user" },
      { type: "workflow_phase", runId, phase: "readiness" },
      { type: "question_requested", runId, questionId: "q1", question: "어떤 역할인가요?", options: ["지원"] },
    ], "waiting_for_user")
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={appCommands} modelLabel="m" />)
    expect(screen.getByText("작성에 필요한 근거 확인")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "지원" }))
    fireEvent.click(screen.getByRole("button", { name: "답변 제출" }))
    expect(answerQuestion).toHaveBeenCalledWith("q1", "지원")
  })

  it("reopen reads the full answer and deduplicates one activity row per call id", () => {
    const current = snapshot([
      { type: "run_started", runId, question: "질문", currentNote: null },
      { type: "text", runId, delta: "첫째 " },
      { type: "tool_call", runId, callId: "c1", tool: "read_note", args: {} },
      { type: "tool_call", runId, callId: "c1", tool: "read_note", args: {} },
      { type: "tool_result", runId, callId: "c1", summary: "완료", truncated: false },
      { type: "text", runId, delta: "둘째" },
    ])

    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={commands()} modelLabel="m" />)

    expect(screen.getByText("질문")).toBeTruthy()
    expect(screen.getByText("첫째 둘째")).toBeTruthy()
    expect(screen.getAllByText(/read_note/)).toHaveLength(1)
  })

  it("shows both conflict sources and never links an unsupported citation", () => {
    const left = { kind: "vault" as const, path: "A.md", heading: "One", excerpt: "left" }
    const right = {
      kind: "external" as const,
      source: "wikipedia" as const,
      title: "Right",
      url: "https://en.wikipedia.org/wiki/Right",
      excerpt: "right",
    }
    const current = snapshot([
      { type: "run_started", runId, question: "질문", currentNote: null },
      { type: "text", runId, delta: "known [[S1]] unknown [[S9]]" },
      { type: "evidence", runId, sourceId: "S1", reference: left },
      {
        type: "evidence_conflict",
        runId,
        claims: [
          { claim: "left claim", reference: left },
          { claim: "right claim", reference: right },
        ],
      },
    ])
    const appCommands = commands()

    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={appCommands} modelLabel="m" />)

    expect(screen.getByText(/left claim/)).toBeTruthy()
    expect(screen.getByText(/right claim/)).toBeTruthy()
    expect(screen.getByText(/Unverified citation S9/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /A.md/ }))
    expect(appCommands.openSource).toHaveBeenCalledWith(left)
    expect(screen.queryByRole("button", { name: /S9/ })).toBeNull()
  })

  it("reopens preview creation after discard and recaptures a stale target", () => {
    const pending = {
      id: "preview-1",
      targetId: "target-1",
      path: "A.md",
      from: { line: 0, ch: 0 },
      to: { line: 0, ch: 1 },
      before: "a",
      after: "b",
      status: "pending" as const,
    }
    const stale = { ...pending, status: "stale" as const }
    const appCommands = commands()
    appCommands.previewAnswer.mockReturnValueOnce(pending).mockReturnValueOnce(pending)
    appCommands.discardInsertion.mockReturnValue({ ...pending, status: "discarded" as const })
    appCommands.approveInsertion.mockReturnValue(stale)
    const current = snapshot([
      { type: "run_started", runId, question: "질문", currentNote: null },
      { type: "text", runId, delta: "answer" },
    ])
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={appCommands} modelLabel="m" />)

    fireEvent.click(screen.getByRole("button", { name: "Preview answer insertion" }))
    fireEvent.click(screen.getByRole("button", { name: "Discard insertion" }))
    expect(screen.getByRole("button", { name: "Preview answer insertion" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Preview answer insertion" }))
    fireEvent.click(screen.getByRole("button", { name: "Approve insertion" }))
    fireEvent.click(screen.getByRole("button", { name: "Recreate preview" }))
    expect(appCommands.previewAnswer).toHaveBeenLastCalledWith(true)
  })

  it("explains why a preview cannot be made, and clears the notice on a new run", () => {
    const appCommands = commands()
    appCommands.previewBlockedReason.mockReturnValue("The proposed revision failed its fact check.")
    let current = snapshot([
      { type: "run_started", runId, question: "질문", currentNote: null },
      { type: "text", runId, delta: "answer" },
    ])
    const { rerender } = render(
      <App getSnapshot={() => current} subscribe={() => () => {}} commands={appCommands} modelLabel="m" />
    )

    fireEvent.click(screen.getByRole("button", { name: "Preview answer insertion" }))
    expect(screen.getByText("The proposed revision failed its fact check.")).toBeTruthy()

    current = snapshot([
      { type: "run_started", runId: "run-2" as typeof runId, question: "다음", currentNote: null },
      { type: "text", runId: "run-2" as typeof runId, delta: "answer" },
    ])
    rerender(<App getSnapshot={() => current} subscribe={() => () => {}} commands={appCommands} modelLabel="m" />)
    expect(screen.queryByText("The proposed revision failed its fact check.")).toBeNull()
  })

  it("restores a draft from the external session snapshot", () => {
    const current = { ...snapshot([], "idle"), draft: "복원된 초안" }
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={commands()} modelLabel="m" />)
    expect((screen.getByRole("textbox", { name: "Ask about this note" }) as HTMLTextAreaElement).value).toBe(
      "복원된 초안"
    )
  })
})
