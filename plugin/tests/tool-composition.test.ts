import { describe, expect, it, vi } from "vitest"

import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { RunEvent, RunId } from "../src/harness/events"
import type { RunInput } from "../src/harness/harness"
import { runAgentLoop } from "../src/harness/agent-loop"
import type { PermissionContext } from "../src/harness/policy"
import type { ModelEvent, ModelProvider, ModelRequest, RequestCounter } from "../src/providers/types"
import { createToolRegistry } from "../src/tools/create-registry"

const runId = "run-test" as RunId
const input: RunInput = {
  question: "question",
  packet: {
    systemInstructions: "system",
    currentNote: null,
    style: null,
    researchTopic: null,
    evidence: [],
    conversation: [],
    omitted: [],
  },
}
const counter: RequestCounter = {
  count: vi.fn(async () => ({ promptTokens: 100, method: "exact" as const })),
}

const NOTE = "# Project\n\nSee [[Other]].\n\n## Result\n\nShipped the cache."
const vault = {
  listNotes: () => [
    { path: "Project.md", title: "Project" },
    { path: "Other.md", title: "Other" },
  ],
  readNote: async (path: string) => (path === "Project.md" ? NOTE : null),
}

function scripted(rounds: readonly (readonly ModelEvent[])[]): ModelProvider & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = []
  return {
    id: "scripted",
    requests,
    health: async () => ({ reachable: true, detail: "ok" }),
    listModels: async () => [],
    stream: (request) => {
      requests.push(request)
      const events = rounds[requests.length - 1] ?? [{ type: "done", reason: "stop" } as const]
      return (async function* () {
        for (const event of events) yield event
      })()
    },
  }
}

const call = (callId: string, name: string, args: unknown): readonly ModelEvent[] => [
  { type: "tool_call", call: { callId, name, args } },
  { type: "done", reason: "tool_calls" },
]

async function collect(
  provider: ModelProvider,
  permissions: () => PermissionContext,
  stage?: RunInput["stage"]
): Promise<RunEvent[]> {
  const events: RunEvent[] = []
  const tools = createToolRegistry({ vault, experienceFolder: () => "", fetchImpl: vi.fn() as never })
  for await (const event of runAgentLoop(
    runId,
    stage ? { ...input, stage } : input,
    { provider, model: "m", tools, limits: PROPOSED_LIMITS, counter, permissions },
    new AbortController().signal
  )) {
    events.push(event)
  }
  return events
}

const off = () => ({ networkResearchEnabled: false })
const on = () => ({ networkResearchEnabled: true })
const offered = (request: ModelRequest | undefined) => request?.tools.map((tool) => tool.name).sort()

describe("createToolRegistry", () => {
  const registry = createToolRegistry({ vault, experienceFolder: () => "" })

  it("registers the note and Wikipedia tools and nothing that is not wired", () => {
    expect(registry.names().sort()).toEqual([
      "get_note_context",
      "propose_revision",
      "read_note",
      "read_wikipedia_page",
      "search_vault",
      "search_wikipedia",
    ])
  })
})

describe("tools offered to the model", () => {
  it("offers only the note tools while Wikipedia Research is off", async () => {
    const provider = scripted([[{ type: "done", reason: "stop" }]])
    await collect(provider, off)
    expect(offered(provider.requests[0])).toEqual(["get_note_context", "read_note", "search_vault"])
  })

  it("adds the Wikipedia tools when Wikipedia Research is on", async () => {
    const provider = scripted([[{ type: "done", reason: "stop" }]])
    await collect(provider, on)
    expect(offered(provider.requests[0])).toEqual([
      "get_note_context",
      "read_note",
      "read_wikipedia_page",
      "search_vault",
      "search_wikipedia",
    ])
  })

  it("applies a setting changed mid-run to the next request", async () => {
    let enabled = false
    const provider = scripted([
      call("c1", "get_note_context", { path: "Project.md" }),
      [{ type: "done", reason: "stop" }],
    ])
    const events: RunEvent[] = []
    const tools = createToolRegistry({ vault, experienceFolder: () => "" })
    for await (const event of runAgentLoop(
      runId,
      input,
      { provider, model: "m", tools, limits: PROPOSED_LIMITS, counter, permissions: () => ({ networkResearchEnabled: enabled }) },
      new AbortController().signal
    )) {
      events.push(event)
      if (event.type === "tool_result") enabled = true
    }

    expect(offered(provider.requests[0])).not.toContain("search_wikipedia")
    expect(offered(provider.requests[1])).toContain("search_wikipedia")
  })
})

describe("stages", () => {
  const revision = { original: "I cut latency by 30%.", revised: "I cut latency 30%.", criteria: "shorter" }

  it("withholds propose_revision while exploring and offers it when revising", async () => {
    const exploring = scripted([[{ type: "done", reason: "stop" }]])
    await collect(exploring, off)
    expect(offered(exploring.requests[0])).not.toContain("propose_revision")

    const revising = scripted([[{ type: "done", reason: "stop" }]])
    await collect(revising, off, "revise")
    expect(offered(revising.requests[0])).toContain("propose_revision")
  })

  it("refuses propose_revision named during exploration, and runs it when revising", async () => {
    const script = () => scripted([call("c1", "propose_revision", revision), [{ type: "done", reason: "stop" }]])

    const exploring = await collect(script(), off)
    expect(exploring).toContainEqual(expect.objectContaining({ type: "tool_failed", callId: "c1" }))
    expect(exploring).toContainEqual(expect.objectContaining({ type: "run_completed", outcome: "complete" }))

    const revising = await collect(script(), off, "revise")
    expect(revising).toContainEqual(expect.objectContaining({ type: "tool_result", callId: "c1" }))
  })
})

describe("tool execution through the composed registry", () => {
  it("refuses a hidden Wikipedia tool named anyway, without ending the run", async () => {
    const fetchImpl = vi.fn()
    const provider = scripted([call("c1", "search_wikipedia", { topicId: "topic-1" }), [{ type: "done", reason: "stop" }]])
    const tools = createToolRegistry({ vault, experienceFolder: () => "", fetchImpl: fetchImpl as never })
    const events: RunEvent[] = []
    for await (const event of runAgentLoop(
      runId,
      input,
      { provider, model: "m", tools, limits: PROPOSED_LIMITS, counter, permissions: off },
      new AbortController().signal
    )) {
      events.push(event)
    }

    expect(events).toContainEqual(expect.objectContaining({ type: "tool_failed", callId: "c1" }))
    expect(events).toContainEqual(expect.objectContaining({ type: "run_completed", outcome: "complete" }))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("runs read_note and get_note_context against the vault", async () => {
    const provider = scripted([
      call("c1", "get_note_context", { path: "Project.md" }),
      call("c2", "read_note", { path: "Project.md", heading: "Result" }),
      [{ type: "done", reason: "stop" }],
    ])
    const events = await collect(provider, off)

    const results = events.filter((event) => event.type === "tool_result")
    expect(results).toHaveLength(2)
    expect(JSON.parse(results[0]?.type === "tool_result" ? results[0].summary : "{}")).toMatchObject({
      path: "Project.md",
      headings: [
        { level: 1, text: "Project" },
        { level: 2, text: "Result" },
      ],
      links: [{ status: "resolved", path: "Other.md" }],
    })
    expect(events).toContainEqual(
      expect.objectContaining({ type: "evidence", reference: expect.objectContaining({ path: "Project.md" }) })
    )
  })
})
