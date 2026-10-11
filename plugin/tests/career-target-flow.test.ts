import { describe, expect, it } from "vitest"

import type { EditorTarget } from "../src/context/insertion"
import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent, RunId } from "../src/harness/events"
import type { RunInput } from "../src/harness/run-input"
import type { ModelProvider, ModelRequest } from "../src/providers/types"
import { createToolRegistry } from "../src/tools/create-registry"
import { runCareerWorkflow } from "../src/workflow/career-graph"
import type { UserQuestion } from "../src/workflow/state"
import { paragraphCandidates } from "../src/workflow/targets"

const document = "# Experience\r\n\r\nI helped test.\r\n\r\nI improved docs."
const note = { path: "career.md", title: "Experience", text: document, isSelection: false }
const candidates = paragraphCandidates(note)
const first = candidates[0]!
const second = candidates[1]!
const selected: EditorTarget = {
  id: "selected-1", path: note.path, text: document, selection: first.text,
  from: first.from, to: first.to,
}
const baseInput: RunInput = {
  question: "Make the docs paragraph clearer", mode: "career",
  packet: {
    systemInstructions: "", currentNote: note, style: null, researchTopic: null,
    evidence: [], conversation: [], omitted: [],
  },
}
const analysis = {
  intent: "revise", applicationQuestion: "", criteria: "clearer", query: "experience", requiredFacts: [],
}
const readiness = { ready: true, sourceIds: ["S1"], missing: [], conflicts: [] }
const outline = { sourceIds: ["S1"], outline: ["Personal action"] }
const supported = { supported: true, issues: [], needsNewFacts: false }
const draft = (text: string) => ({ claims: [{
  text: text === first.text ? "I helped with testing." : text === second.text ? "I improved the docs." : text,
  evidence: ["S1"],
}] })

async function run(input: RunInput, responses: unknown[], answer?: (question: UserQuestion) => string) {
  const requests: ModelRequest[] = []
  const questions: UserQuestion[] = []
  const provider: ModelProvider = {
    id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [],
    stream: async function* (request) {
      const response = responses[requests.length]
      requests.push(request)
      if (response === undefined) throw new Error("Unexpected model call")
      yield { type: "text", delta: JSON.stringify(response) }
      yield { type: "done", reason: "stop" }
    },
  }
  const events: RunEvent[] = []
  const tools = createToolRegistry({
    vault: { listNotes: () => [], readNote: async (path) => path === note.path ? note.text : null },
    experienceFolder: () => "",
  })
  for await (const event of runCareerWorkflow("target-run" as RunId, input, {
    provider, model: "test", tools, limits: PROPOSED_LIMITS,
    counter: { count: async () => ({ method: "exact", promptTokens: 100 }) },
    permissions: () => ({ networkResearchEnabled: false }),
    waitForUser: async (question) => {
      questions.push(question)
      if (!answer) throw new Error("Unexpected user question")
      return { questionId: "question-1", answerId: "answer-1", answer: answer(question) }
    },
  }, new AbortController().signal)) events.push(event)
  return { events, requests, questions }
}

describe("career paragraph target integration", () => {
  it("resolves an automatic target from its trusted ID and preserves the exact document snapshot", async () => {
    const { events, requests, questions } = await run(baseInput, [
      analysis, { candidateIds: [second.id] }, readiness, outline, draft(second.text), supported,
    ])
    const final = events.find(event => event.type === "verified_draft")
    expect(final).toMatchObject({
      target: { id: second.id, path: note.path, text: document, selection: second.text, from: second.from, to: second.to },
    })
    expect(events.find(event => event.type === "run_completed")).toMatchObject({ outcome: "complete" })
    expect(questions).toHaveLength(0)
    const selectionData = JSON.parse(requests[1]!.messages.find(message => message.role === "user")!.content)
    expect(selectionData.candidates).toEqual(candidates.map(candidate => ({ id: candidate.id, text: candidate.text })))
    expect(requests[1]!.tools).toEqual([])
  })

  it("prefers an explicit selection and never asks the model to select a different paragraph", async () => {
    const { events, requests } = await run({ ...baseInput, target: selected }, [
      analysis, readiness, outline, draft(first.text), supported,
    ])
    expect(events.find(event => event.type === "verified_draft")).toMatchObject({ target: selected })
    expect(events.filter(event => event.type === "workflow_phase").map(event => event.phase)).not.toContain("target")
    expect(requests).toHaveLength(5)
  })

  it("uses selection as an insertion guard rather than forcing revision when analysis chooses draft", async () => {
    const { events, requests } = await run({ ...baseInput, target: selected }, [
      { ...analysis, intent: "draft", applicationQuestion: "Describe your contribution" },
      "Exploration finished", readiness, outline, draft("I helped test."), supported,
    ])
    expect(events.find(event => event.type === "run_completed")).toMatchObject({ outcome: "complete" })
    expect(events.find(event => event.type === "verified_draft")).toMatchObject({
      target: {
        id: selected.id, selection: "", from: selected.to, to: selected.to,
        selectionGuard: { selection: selected.selection, from: selected.from, to: selected.to },
      },
    })
    const draftRequest = requests.find(request => request.messages.some(message => message.content.includes("Write the requested draft")))!
    expect(JSON.parse(draftRequest.messages.find(message => message.role === "user")!.content).original).toBeNull()
    expect(events.filter(event => event.type === "workflow_phase").map(event => event.phase)).toContain("explore")
  })

  it("presents trusted exact labels when multiple paragraphs match and accepts only the chosen label", async () => {
    const { events, questions } = await run(baseInput, [
      analysis, { candidateIds: [first.id, second.id] }, readiness, outline, draft(second.text), supported,
    ], question => question.options![1]!)
    expect(questions).toEqual([{
      question: "수정할 문단을 골라주세요.",
      options: [`${first.id}: ${first.text}`, `${second.id}: ${second.text}`],
    }])
    expect(events.find(event => event.type === "verified_draft")).toMatchObject({ target: { selection: second.text } })
  })

  it("rejects invented model IDs before asking questions or drafting", async () => {
    const { events, requests, questions } = await run(baseInput, [analysis, { candidateIds: [first.id, "invented.md#paragraph-1-1"] }])
    expect(requests).toHaveLength(2)
    expect(questions).toHaveLength(0)
    expect(events.some(event => event.type === "verified_draft")).toBe(false)
    expect(events.find(event => event.type === "run_completed")).toMatchObject({ outcome: "incomplete" })
  })

  it("rejects a bare ID reply to an ambiguous choice because it is not an offered label", async () => {
    const { events, requests } = await run(baseInput, [analysis, { candidateIds: [first.id, second.id] }], () => second.id)
    expect(requests).toHaveLength(2)
    expect(events.some(event => event.type === "verified_draft")).toBe(false)
    expect(events.find(event => event.type === "workflow_incomplete")).toMatchObject({ message: "제시된 문단 중 하나를 선택해주세요." })
  })

  it("retains the tracked target identity when an empty selection is resolved automatically", async () => {
    const cursor: EditorTarget = { ...selected, selection: "", from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 } }
    const { events } = await run({ ...baseInput, target: cursor }, [
      analysis, { candidateIds: [second.id] }, readiness, outline, draft(second.text), supported,
    ])
    expect(events.find(event => event.type === "verified_draft")).toMatchObject({
      target: {
        id: cursor.id, selection: second.text, from: second.from, to: second.to,
        selectionGuard: { selection: "", from: cursor.from, to: cursor.to },
      },
    })
  })
})
