import { describe, expect, it } from "vitest"

import type { ToolExecutionContext } from "../src/tools/registry"
import { ToolRegistry } from "../src/tools/registry"
import { createMemoryWorkingNoteStore, registerSaveWorkingNoteTool } from "../src/tools/save-working-note"

function context(): ToolExecutionContext {
  return {
    signal: new AbortController().signal,
    researchTopic: null,
    allowedWikipediaPages: new Set(),
    permissions: () => ({ networkResearchEnabled: false }),
    onResearchQuery: () => {},
  }
}

const note = {
  expectedVersion: 0,
  facts: [{ claim: "캐시 도입으로 조회 지연을 줄였다.", sourceIds: ["S1", "S2"] }],
  interpretations: [{ note: "성능 개선 경험이 지원 직무와 가깝다.", relatedSourceIds: ["S1"] }],
  missing: ["개선 수치"],
  outline: ["문제", "행동", "결과"],
}

function setup() {
  const store = createMemoryWorkingNoteStore("run-1")
  const registry = new ToolRegistry()
  registerSaveWorkingNoteTool(registry, store)
  return { store, tool: registry.get("save_working_note")! }
}

describe("save_working_note", () => {
  it("saves and reports the version with the original fact source IDs", async () => {
    const { tool } = setup()
    expect(await tool.run(note as never, context())).toEqual({
      status: "saved",
      stateId: "run-1:working-note",
      version: 1,
      factSourceIds: ["S1", "S2"],
    })
  })

  it("rejects a stale version without replacing the saved state", async () => {
    const { tool } = setup()
    await tool.run(note as never, context())

    expect(await tool.run(note as never, context())).toEqual({
      status: "rejected",
      code: "version_conflict",
      currentVersion: 1,
    })
    expect(await tool.run({ ...note, expectedVersion: 1 } as never, context())).toMatchObject({
      status: "saved",
      version: 2,
    })
  })

  it("rejects saves after the run closed", async () => {
    const { store, tool } = setup()
    store.close()
    expect(await tool.run(note as never, context())).toEqual({ status: "rejected", code: "run_closed" })
  })

  it("requires a source ID on every fact and keeps run identity out of the input", () => {
    const { tool } = setup()
    expect(tool.input.safeParse({ ...note, facts: [{ claim: "출처 없음", sourceIds: [] }] }).success).toBe(false)
    expect(tool.input.safeParse({ ...note, runId: "run-2" }).success).toBe(false)
    expect(tool.input.safeParse({ ...note, interpretations: [{ note: "x", sourceIds: ["S1"] }] }).success).toBe(false)
    expect(JSON.stringify(tool.parameters)).not.toMatch(/runId|stateId/)
  })
})
