import { describe, expect, it } from "vitest";
import { runCareerWorkflow } from "../src/workflow/career-graph";
import { PROPOSED_LIMITS } from "../src/harness/budget";
import { fakeRequestCounter } from "../src/providers/fake";
import type { ModelProvider, ModelRequest } from "../src/providers/types";
import type { RunEvent, RunId } from "../src/harness/events";
import { createToolRegistry } from "../src/tools/create-registry";

const target = { id: "target-1", path: "note.md", text: "I helped test.", selection: "I helped test.", from: { line: 0, ch: 0 }, to: { line: 0, ch: 14 } };
const input = { question: "Make this shorter", mode: "career" as const, target, packet: { systemInstructions: "s", currentNote: { path: target.path, title: "Note", text: target.text, isSelection: true }, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] } };
const analysis = { intent: "revise", applicationQuestion: "", criteria: "shorter", query: "test", requiredFacts: [] };
const ready = { ready: true, sourceIds: ["S1"], missing: [], conflicts: [] };
const outline = { sourceIds: ["S1"], outline: ["My action"] };
const draft = { claims: [{ text: "I helped with testing.", evidence: ["S1"] }] };
const supported = { supported: true, issues: [], needsNewFacts: false };

async function run(responses: unknown[]) {
  let calls = 0;
  const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* () { const value = responses[calls++]; if (value === undefined) throw new Error("Unexpected model call"); yield { type: "text", delta: JSON.stringify(value) }; yield { type: "done", reason: "stop" }; } };
  const events: RunEvent[] = [];
  for await (const event of runCareerWorkflow("run-1" as RunId, input, { provider, model: "test", tools: createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" }), counter: fakeRequestCounter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }), waitForUser: async () => { throw new Error("No user answer"); } }, new AbortController().signal)) events.push(event);
  return { events, calls };
}

describe("career workflow gates", () => {
  it("emits only a verified final draft after ordered phases", async () => {
    const { events } = await run([analysis, ready, outline, draft, supported]);
    expect(events.filter(e => e.type === "workflow_phase").map(e => e.phase)).toEqual(["analyze", "readiness", "outline", "draft", "verify", "preview"]);
    expect(events.find(e => e.type === "verified_draft")).toMatchObject({ text: "I helped with testing. [[S1]]", target });
    expect(events.find(e => e.type === "run_completed")).toMatchObject({ outcome: "complete" });
    expect(events.filter(e => e.type === "text")).toHaveLength(1);
  });

  it("blocks an unsupported role change even with a valid source ID", async () => {
    const bad = { claims: [{ text: "I led the whole project.", evidence: ["S1"] }] };
    const failed = { supported: false, issues: ["Role changed"], needsNewFacts: false };
    const { events, calls } = await run([analysis, ready, outline, bad, failed, bad, failed]);
    expect(calls).toBe(7);
    expect(events.some(e => e.type === "verified_draft")).toBe(false);
    expect(events.find(e => e.type === "run_completed")).toMatchObject({ outcome: "incomplete" });
  });

  it("never drafts when an unresolved conflict requires new facts", async () => {
    const { events, calls } = await run([analysis, { ...ready, ready: false, missing: [], conflicts: ["Role conflicts"] }]);
    expect(calls).toBe(2);
    expect(events.some(e => e.type === "verified_draft")).toBe(false);
  });
});

it("forwards fixed sampling to every model request only when supplied", async () => {
  const seen: Array<ModelRequest["sampling"]> = [];
  const responses: unknown[] = [analysis, ready, outline, draft, supported];
  const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* (request) { seen.push(request.sampling); yield { type: "text", delta: JSON.stringify(responses[seen.length - 1]) }; yield { type: "done", reason: "stop" }; } };
  const deps = { provider, model: "test", tools: createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "" }), counter: fakeRequestCounter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }), waitForUser: async () => { throw new Error("No user answer"); }, sampling: { temperature: 0, seed: 7 } };
  for await (const _event of runCareerWorkflow("run-1" as RunId, input, deps, new AbortController().signal)) { /* consume */ }
  expect(seen).toHaveLength(5);
  expect(seen.every(value => value?.temperature === 0 && value.seed === 7)).toBe(true);
});
