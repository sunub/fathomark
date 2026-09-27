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
    approveInsertion,
    discardInsertion,
  }
}

describe("app snapshot rendering", () => {
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

  it("restores a draft from the external session snapshot", () => {
    const current = { ...snapshot([], "idle"), draft: "복원된 초안" }
    render(<App getSnapshot={() => current} subscribe={() => () => {}} commands={commands()} modelLabel="m" />)
    expect((screen.getByRole("textbox", { name: "Ask about this note" }) as HTMLTextAreaElement).value).toBe(
      "복원된 초안"
    )
  })
})
