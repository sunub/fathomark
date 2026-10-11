import { describe, expect, it } from "vitest"

import { runCareerWorkflow } from "../src/workflow/career-graph"
import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent, RunId } from "../src/harness/events"
import type { RunInput } from "../src/harness/run-input"
import type { ModelProvider, ModelRequest, RequestCounter } from "../src/providers/types"
import { createToolRegistry } from "../src/tools/create-registry"

const supported = { checks: [], originalFacts: [], requiredFacts: [], needsNewFacts: false, supported: true }
const failed = { checks: [{ claim: "draft", facts: [], evidence: "", differences: ["Role changed"], sameMeaning: false }], originalFacts: [], requiredFacts: [], needsNewFacts: false, supported: false }
const analysis = { intent: "revise", applicationQuestion: "", criteria: "명확하게", query: "경험", requiredFacts: [] }
const ready = (quote: string) => ({ facts: [{ fact: "본인 행동", sourceId: "S1", quote }], conflicts: [], ready: true })
const outline = { sourceIds: ["S1"], outline: ["본인 행동"] }
const draft = (text: string, evidence = ["S1"]) => ({ claims: [{ text, evidence }] })
const exactCounter: RequestCounter = { count: async () => ({ promptTokens: 100, method: "exact" }) }

function inputFor(original: string, extra: Partial<RunInput> = {}): RunInput {
  return {
    question: "문단을 명확하게 수정해줘", mode: "career",
    target: { id: "target-1", path: "note.md", text: original, selection: original, from: { line: 0, ch: 0 }, to: { line: 0, ch: original.length } },
    packet: { systemInstructions: "s", currentNote: null, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] },
    ...extra,
  }
}

async function run(input: RunInput, responses: unknown[]) {
  let calls = 0
  const requests: ModelRequest[] = []
  const provider: ModelProvider = {
    id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [],
    stream: async function* (request) {
      requests.push(request)
      const response = responses[calls++]
      if (response === undefined) throw new Error("Unexpected extra model call")
      yield { type: "text", delta: JSON.stringify(response) }
      yield { type: "done", reason: "stop" }
    },
  }
  const tools = createToolRegistry({
    vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "",
    ...(input.pastedSource ? { publicSources: { read: async () => ({ title: "공고", text: input.pastedSource!, collectedAt: "2026-10-11T00:00:00Z" }) } } : {}),
  })
  const events: RunEvent[] = []
  for await (const event of runCareerWorkflow("guardrail-run" as RunId, input, {
    provider, model: "test", tools, counter: exactCounter, limits: PROPOSED_LIMITS,
    permissions: () => ({ networkResearchEnabled: false }),
    waitForUser: async () => { throw new Error("Unexpected question") },
  }, new AbortController().signal)) events.push(event)
  return { calls, requests, events }
}

describe("career writing guardrails", () => {
  it("blocks invented numbers despite a passing semantic reviewer", async () => {
    const bad = draft("응답 시간을 230ms로 줄였습니다.")
    const result = await run(inputFor("응답 시간을 320ms로 줄였습니다."), [analysis, ready("응답 시간을 320ms로 줄였습니다."), outline, bad, supported, bad, supported])
    expect(result.calls).toBe(7)
    expect(result.events.some(event => event.type === "verified_draft")).toBe(false)
    expect(result.events.find(event => event.type === "run_completed")).toMatchObject({ outcome: "incomplete" })
  })

  it("blocks omission of explicit mandatory facts despite semantic approval", async () => {
    const bad = draft("테스트를 작성했습니다.")
    const result = await run(inputFor("테스트 작성을 도왔습니다.", { keepFacts: ["도왔"] }), [analysis, ready("테스트 작성을 도왔습니다."), outline, bad, supported, bad, supported])
    expect(result.calls).toBe(7)
    expect(result.events.some(event => event.type === "verified_draft")).toBe(false)
    expect(result.events.find(event => event.type === "workflow_incomplete")).toMatchObject({ message: expect.stringContaining("도왔") })
  })

  it("repairs a failed semantic review once and publishes only the repaired text", async () => {
    const result = await run(inputFor("테스트 작성을 도왔습니다."), [analysis, ready("테스트 작성을 도왔습니다."), outline, draft("전체 프로젝트를 총괄했습니다."), failed, draft("테스트 작성에 도움을 주었습니다."), supported])
    expect(result.calls).toBe(7)
    expect(result.events.filter(event => event.type === "workflow_phase" && event.phase === "repair")).toHaveLength(1)
    expect(result.events.filter(event => event.type === "verified_draft")).toEqual([expect.objectContaining({ text: "테스트 작성에 도움을 주었습니다. [[S1]]" })])
    expect(result.events.filter(event => event.type === "text")).toEqual([expect.objectContaining({ delta: "테스트 작성에 도움을 주었습니다. [[S1]]" })])
  })

  it("never offers an unchanged revision after the single repair allowance", async () => {
    const unchanged = draft("테스트 작성을 도왔습니다.")
    const result = await run(inputFor("테스트 작성을 도왔습니다."), [analysis, ready("테스트 작성을 도왔습니다."), outline, unchanged, supported, unchanged, supported])
    expect(result.calls).toBe(7)
    expect(result.events.filter(event => event.type === "workflow_phase" && event.phase === "repair")).toHaveLength(1)
    expect(result.events.some(event => event.type === "verified_draft")).toBe(false)
    expect(result.events.find(event => event.type === "run_completed")).toMatchObject({ outcome: "incomplete" })
  })

  it("stops after the second failed verification without another repair", async () => {
    const bad = draft("전체 프로젝트를 총괄했습니다.")
    const result = await run(inputFor("테스트 작성을 도왔습니다."), [analysis, ready("테스트 작성을 도왔습니다."), outline, bad, failed, bad, failed])
    expect(result.calls).toBe(7)
    expect(result.events.filter(event => event.type === "workflow_phase" && event.phase === "repair")).toHaveLength(1)
    expect(result.events.some(event => event.type === "verified_draft")).toBe(false)
  })

  it("preserves partial posting metadata and rejects it as personal evidence", async () => {
    const pastedSource = "개발자 모집 및 직무 설명 ".repeat(1000)
    const bad = draft("개발 경험이 있습니다.", ["S2"])
    const result = await run(inputFor("테스트 작성을 도왔습니다.", { pastedSource }), [analysis, ready("테스트 작성을 도왔습니다."), outline, bad, supported, bad, supported])
    expect(result.events.find(event => event.type === "evidence" && event.reference.kind === "public")).toMatchObject({
      sourceId: "S2", reference: { kind: "public", extraction: "partial", omitted: expect.arrayContaining([expect.any(String)]) },
    })
    expect(result.calls).toBe(7)
    expect(result.events.some(event => event.type === "verified_draft")).toBe(false)
    const draftRequest = result.requests[3]!
    expect(draftRequest.messages.some(message => message.content.includes('"extraction":"partial"'))).toBe(true)
  })
})
