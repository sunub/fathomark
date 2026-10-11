import { describe, expect, it, vi } from "vitest";
import type { ModelProvider, ModelRequest } from "../src/providers/types";
import type { RunEvent, RunId } from "../src/harness/events";
import { AgentHarness } from "../src/harness/harness";
import { RunSession } from "../src/harness/session";
import { PROPOSED_LIMITS } from "../src/harness/budget";
import { FakeModelProvider, fakeRequestCounter } from "../src/providers/fake";
import { createToolRegistry } from "../src/tools/create-registry";
import { pastedSourceReader } from "../src/workflow/public-sources";
import { runCareerWorkflow } from "../src/workflow/career-graph";

const packet = { systemInstructions: "", currentNote: { path: "a.md", title: "Experience", text: "I helped test.", isSelection: false }, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] };
describe("career input and runtime wiring", () => {
  it("provides the pasted question before analysis without asking for the same input again", async () => {
    const pasted = "지원 문항: 협업을 통해 문제를 해결한 경험을 설명하세요.";
    const requests: ModelRequest[] = [];
    const responses = [
      { intent: "draft", applicationQuestion: "협업을 통해 문제를 해결한 경험을 설명하세요.", criteria: "", query: "test", requiredFacts: ["personal action"] },
      "Exploration finished",
      { ready: true, sourceIds: ["S2"], missing: [], conflicts: [] },
      { sourceIds: ["S2"], outline: ["My action"] },
      { claims: [{ text: "I helped with testing.", evidence: ["S2"] }] },
      { checks: [], originalFacts: [], requiredFacts: [], needsNewFacts: false, supported: true },
    ];
    const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* (request) { const response = responses[requests.length]; requests.push(request); yield { type: "text", delta: JSON.stringify(response) }; yield { type: "done", reason: "stop" }; } };
    const waitForUser = vi.fn(async () => { throw new Error("Duplicate question"); });
    const tools = createToolRegistry({ vault: { listNotes: () => [], readNote: async () => packet.currentNote.text }, experienceFolder: () => "", publicSources: pastedSourceReader(pasted) });
    const events: RunEvent[] = [];
    for await (const event of runCareerWorkflow("r" as RunId, { question: "붙여넣은 문항에 맞춰 작성해줘", mode: "career", pastedSource: pasted, packet }, { provider, tools, model: "m", counter: { count: async () => ({ method: "exact", promptTokens: 100 }) }, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }), waitForUser }, new AbortController().signal)) events.push(event);
    const analysisInput = JSON.parse(requests[0]!.messages.find(m => m.role === "user")!.content);
    expect(analysisInput.posting.text).toBe(pasted);
    expect(waitForUser).not.toHaveBeenCalled();
    expect(events.find(e => e.type === "verified_draft")).toMatchObject({ text: "I helped with testing. [[S2]]" });
  });

  it("clears old output and enters a recoverable failure on invalid runtime configuration", async () => {
    let invalid = false;
    const provider = new FakeModelProvider({ chunks: ["old answer"] });
    const tools = createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" });
    const harness = new AgentHarness({ provider, tools, model: "fake", counter: fakeRequestCounter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }), resolveRuntime: () => { if (invalid) throw new Error("Invalid model address"); return { provider, tools, model: "fake", counter: fakeRequestCounter }; } });
    const session = new RunSession(harness);
    await harness.run({ question: "first", packet });
    invalid = true;
    await harness.run({ question: "second", packet });
    expect(harness.currentState()).toBe("failed");
    expect(session.getSnapshot().events.filter(e => e.type === "text")).toHaveLength(0);
    expect(session.getVerifiedDraft()).toBeNull();
    expect(session.getSnapshot().events.find(e => e.type === "run_started")).toMatchObject({ question: "second" });
  });

  it("does not complete if cancelled immediately after the verified draft event", async () => {
    const responses = [
      { intent: "revise", applicationQuestion: "", criteria: "shorter", query: "test", requiredFacts: [] },
      { ready: true, sourceIds: ["S1"], missing: [], conflicts: [] },
      { sourceIds: ["S1"], outline: ["action"] },
      { claims: [{ text: "I helped with testing.", evidence: ["S1"] }] },
      { checks: [], originalFacts: [], requiredFacts: [], needsNewFacts: false, supported: true },
    ];
    let index = 0;
    const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* () { yield { type: "text", delta: JSON.stringify(responses[index++]) }; yield { type: "done", reason: "stop" }; } };
    const harness = new AgentHarness({ provider, tools: createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" }), model: "m", counter: fakeRequestCounter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }) });
    const session = new RunSession(harness);
    harness.subscribe(e => { if (e.type === "verified_draft") harness.cancel(); });
    await harness.run({ question: "revise", mode: "career", packet, target: { id: "t", path: "a.md", text: packet.currentNote.text, selection: packet.currentNote.text, from: { line: 0, ch: 0 }, to: { line: 0, ch: 14 } } });
    expect(harness.currentState()).toBe("cancelled");
    expect(session.getVerifiedDraft()).toBeNull();
    expect(session.getSnapshot().events.some(e => e.type === "text")).toBe(false);
  });
});
