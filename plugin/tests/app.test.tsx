import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { RunEvent, RunId, RunSnapshot } from "../src/harness/events"
import { App } from "../src/ui/App"

const runId = "run-1" as RunId

afterEach(cleanup)

function snapshot(events: RunEvent[], state: RunSnapshot["state"] = "complete"): RunSnapshot {
  return { version: events.length, state, events }
}

function commands() {
  return {
    ask: vi.fn(async () => ({ accepted: true })),
    stop: vi.fn(),
    retry: vi.fn(async () => ({ accepted: true })),
    openSource: vi.fn(async () => {}),
    setResearchTopic: vi.fn(),
    selectStyle: vi.fn(async () => {}),
    clearStyle: vi.fn(async () => {}),
    saveStyle: vi.fn(async () => {}),
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
})
