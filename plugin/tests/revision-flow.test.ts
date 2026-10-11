import { describe, expect, it, vi } from "vitest"

import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent, RunId } from "../src/harness/events"
import type { RunInput } from "../src/harness/harness"
import { runAgentLoop } from "../src/harness/agent-loop"
import { approvedRevision, revisionPreview } from "../src/harness/revision"
import type { ModelEvent, ModelProvider, RequestCounter } from "../src/providers/types"
import { createToolRegistry } from "../src/tools/create-registry"

const runId = "run-test" as RunId
const SELECTION = "I cut latency by 30% across 12 services."
const input: RunInput = {
  question: "shorter",
  stage: "revise",
  packet: {
    systemInstructions: "s",
    currentNote: null,
    style: null,
    researchTopic: null,
    evidence: [],
    conversation: [],
    omitted: [],
  },
}
const counter: RequestCounter = { count: vi.fn(async () => ({ promptTokens: 100, method: "exact" as const })) }
const vault = { listNotes: () => [], readNote: async () => null }

const propose = (callId: string, revised: string): readonly ModelEvent[] => [
  {
    type: "tool_call",
    call: { callId, name: "propose_revision", args: { original: SELECTION, revised, criteria: "shorter" } },
  },
  { type: "done", reason: "tool_calls" },
]
const GOOD = "I cut latency by 30% across 12 services"
const BAD = "I cut latency by 35% across 12 services."

async function run(rounds: readonly (readonly ModelEvent[])[]): Promise<RunEvent[]> {
  let round = 0
  const provider: ModelProvider = {
    id: "scripted",
    health: async () => ({ reachable: true, detail: "ok" }),
    listModels: async () => [],
    stream: () => {
      const events = rounds[round++] ?? [{ type: "done", reason: "stop" } as const]
      return (async function* () {
        for (const event of events) yield event
      })()
    },
  }
  const events: RunEvent[] = []
  const tools = createToolRegistry({ vault, experienceFolder: () => "" })
  for await (const event of runAgentLoop(
    runId,
    input,
    { provider, model: "m", tools, limits: PROPOSED_LIMITS, counter, permissions: () => ({ networkResearchEnabled: false }) },
    new AbortController().signal
  )) {
    events.push(event)
  }
  return events
}

const outcome = (events: RunEvent[]) => events.find((event) => event.type === "run_completed")

describe("revision limit and preview", () => {
  it("lets one rejected proposal be repaired, then previews the ready one", async () => {
    const events = await run([propose("c1", BAD), propose("c2", GOOD), [{ type: "done", reason: "stop" }]])
    expect(outcome(events)).toMatchObject({ outcome: "complete" })
    expect(approvedRevision(events, SELECTION)).toBe(GOOD)
  })

  it("ends the run as incomplete after a second rejection, with nothing to preview", async () => {
    const events = await run([propose("c1", BAD), propose("c2", BAD), propose("c3", GOOD)])
    expect(outcome(events)).toMatchObject({ outcome: "incomplete", reason: "revision_rejected" })
    expect(events.filter((event) => event.type === "tool_result")).toHaveLength(2)
    expect(approvedRevision(events, SELECTION)).toBeNull()
  })

  it("never previews a rejected proposal, a proposal for another passage, or no proposal", async () => {
    const rejected = await run([propose("c1", BAD), [{ type: "done", reason: "stop" }]])
    expect(approvedRevision(rejected, SELECTION)).toBeNull()

    const ready = await run([propose("c1", GOOD), [{ type: "done", reason: "stop" }]])
    expect(approvedRevision(ready, "A different paragraph.")).toBeNull()
    expect(approvedRevision(ready, `  ${SELECTION.replace(" ", "  ")} `)).toBe(GOOD)

    expect(approvedRevision(await run([[{ type: "text", delta: "prose" }, { type: "done", reason: "stop" }]]), SELECTION)).toBeNull()
  })

  it("says why a preview is not possible", async () => {
    const reason = (events: RunEvent[], selection = SELECTION) => {
      const preview = revisionPreview(events, selection)
      return preview.ok ? null : preview.reason
    }
    expect(reason(await run([[{ type: "done", reason: "stop" }]]))).toMatch(/did not propose/)
    expect(reason(await run([propose("c1", BAD), [{ type: "done", reason: "stop" }]]))).toMatch(/fact check/)
    expect(reason(await run([propose("c1", SELECTION), [{ type: "done", reason: "stop" }]]))).toMatch(/did not change/)
    expect(reason(await run([propose("c1", GOOD), [{ type: "done", reason: "stop" }]]), "Other text.")).toMatch(
      /different passage/
    )
  })
})
