import { describe, expect, it } from "vitest";

import { PROPOSED_LIMITS } from "../src/harness/budget";
import type { RunEvent, RunId } from "../src/harness/events";
import { AgentHarness } from "../src/harness/harness";
import type { RunInput } from "../src/harness/run-input";
import { RunSession } from "../src/harness/session";
import { fakeRequestCounter } from "../src/providers/fake";
import type { ModelProvider, ModelRequest } from "../src/providers/types";
import { createToolRegistry } from "../src/tools/create-registry";
import { runCareerWorkflow } from "../src/workflow/career-graph";

const packet = { systemInstructions: "", currentNote: null, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] };
const insertAt = { id: "t1", path: "letter.md", text: "문항\n", selection: "", from: { line: 1, ch: 0 }, to: { line: 1, ch: 0 } };
const evidence = [{ kind: "vault" as const, path: "exp.md", excerpt: "API 이전을 맡아 지연을 40% 줄였다." }];
const previousText = "API 이전을 맡아 지연을 40% 줄였습니다.";
const ok = { checks: [], originalFacts: [], requiredFacts: [], needsNewFacts: false, supported: true };

function scripted(responses: unknown[]) {
  const requests: ModelRequest[] = [];
  const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* (request) { const response = responses[requests.length]; requests.push(request); if (response === undefined) throw new Error("Unexpected model call"); yield { type: "text", delta: JSON.stringify(response) }; yield { type: "done", reason: "stop" }; } };
  return { provider, requests };
}

const data = (request: ModelRequest | undefined) => JSON.parse(request!.messages.find(m => m.role === "user")!.content);

describe("career follow-up request", () => {
  it("revises the unapplied previous draft from its own evidence, without exploring or re-registering the draft", async () => {
    const { provider, requests } = scripted([
      { intent: "revise", applicationQuestion: "", criteria: "더 짧게", query: "API", requiredFacts: [] },
      { ready: true, sourceIds: ["S1"], missing: [], conflicts: [] },
      { sourceIds: ["S1"], outline: ["이전과 결과"] },
      { claims: [{ text: "API 이전으로 지연을 40% 줄였습니다.", evidence: ["S1"] }] },
      ok,
    ]);
    const input: RunInput = { question: "더 짧게", mode: "career", packet, previous: { evidence, draft: { text: `${previousText} [[S1]]`, target: insertAt } } };
    const events: RunEvent[] = [];
    for await (const event of runCareerWorkflow("r2" as RunId, input, { provider, model: "m", tools: createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" }), limits: PROPOSED_LIMITS, counter: fakeRequestCounter, permissions: () => ({ networkResearchEnabled: false }), waitForUser: async () => { throw new Error("Unexpected question"); } }, new AbortController().signal)) events.push(event);

    expect(events.filter(e => e.type === "workflow_phase").map(e => e.phase)).toEqual(["analyze", "readiness", "outline", "draft", "verify", "preview"]);
    expect(events.filter(e => e.type === "evidence")).toEqual([{ type: "evidence", runId: "r2", sourceId: "S1", reference: evidence[0] }]);
    expect(data(requests[0]).previousDraft).toBe(previousText);
    expect(data(requests[3]).original).toBe(previousText);
    expect(events.find(e => e.type === "verified_draft")).toMatchObject({ text: "API 이전으로 지연을 40% 줄였습니다. [[S1]]", target: insertAt });
  });

  it("starts a new draft with the carried evidence already cited", async () => {
    const { provider, requests } = scripted([
      { intent: "draft", applicationQuestion: "다른 문항", criteria: "", query: "API", requiredFacts: [] },
      { ready: false, sourceIds: [], missing: [], conflicts: [] },
    ]);
    const input: RunInput = { question: "다른 문항으로 써줘", mode: "career", packet, previous: { evidence } };
    const events: RunEvent[] = [];
    for await (const event of runCareerWorkflow("r3" as RunId, input, { provider, model: "m", tools: createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" }), limits: PROPOSED_LIMITS, counter: fakeRequestCounter, permissions: () => ({ networkResearchEnabled: false }), waitForUser: async () => { throw new Error("Unexpected question"); } }, new AbortController().signal)) events.push(event);
    expect(data(requests[0]).previousDraft).toBeNull();
    expect(data(requests[1]).evidence).toEqual([{ sourceId: "S1", reference: evidence[0] }]);
  });
});

describe("run session follow-up context", () => {
  async function completedCareerRun() {
    // S1 is carried in but never cited; S2 is the selected passage the draft cites.
    const { provider } = scripted([
      { intent: "revise", applicationQuestion: "", criteria: "다듬기", query: "API", requiredFacts: [] },
      { ready: true, sourceIds: ["S2"], missing: [], conflicts: [] },
      { sourceIds: ["S2"], outline: ["이전"] },
      { claims: [{ text: previousText, evidence: ["S2"] }] },
      ok,
    ]);
    const tools = createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" });
    const harness = new AgentHarness({ provider, tools, model: "m", counter: fakeRequestCounter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }) });
    const session = new RunSession(harness);
    const selected = { ...insertAt, text: evidence[0]!.excerpt, selection: evidence[0]!.excerpt, from: { line: 0, ch: 0 }, to: { line: 0, ch: evidence[0]!.excerpt.length } };
    const input: RunInput = { question: "다듬어줘", mode: "career", packet, target: selected, previous: { evidence: [{ kind: "vault", path: "other.md", excerpt: "관련 없는 기록" }] } };
    session.rememberRequest(input, selected);
    await harness.run(input);
    return session;
  }

  it("offers the last career run's evidence and its verified draft", async () => {
    const session = await completedCareerRun();
    const followUp = session.followUp();
    expect(followUp?.evidence.length).toBeGreaterThan(0);
    expect(followUp?.draft?.text).toContain(previousText);
  });

  it("carries only the sources the verified draft cited, so evidence does not pile up across requests", async () => {
    const session = await completedCareerRun();
    expect(session.followUp()?.evidence).toEqual([{ kind: "vault", path: "letter.md", excerpt: evidence[0]!.excerpt }]);
  });

  it("drops the draft once it was applied to the note", async () => {
    const session = await completedCareerRun();
    session.markApplied();
    expect(session.followUp()?.draft).toBeUndefined();
  });

  it("offers nothing after a chat run", () => {
    const harness = new AgentHarness({ provider: scripted([]).provider, tools: createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" }), model: "m", counter: fakeRequestCounter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }) });
    const session = new RunSession(harness);
    session.rememberRequest({ question: "q", packet }, null);
    expect(session.followUp()).toBeNull();
  });
});
