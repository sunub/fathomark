import { describe, expect, it } from "vitest";
import { runCareerWorkflow } from "../src/workflow/career-graph";
import { createToolRegistry } from "../src/tools/create-registry";
import type { RunEvent, RunId } from "../src/harness/events";
import type { ModelEvent, ModelProvider, ModelRequest } from "../src/providers/types";
import { PROPOSED_LIMITS } from "../src/harness/budget";

describe("career tool error observations", () => {
  it("records a failed read as a failed tool, never an empty search or a running activity", async () => {
    const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* () { yield { type: "text", delta: JSON.stringify({ intent: "draft", applicationQuestion: "Describe your experience", criteria: "", query: "test", requiredFacts: [] }) }; yield { type: "done", reason: "stop" }; } };
    const events: RunEvent[] = [];
    const tools = createToolRegistry({ vault: { listNotes: () => [], readNote: async () => { throw new Error("Vault unavailable"); } }, experienceFolder: () => "" });
    const packet = { systemInstructions: "", currentNote: { path: "a.md", title: "Note", text: "I helped test.", isSelection: false }, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] };
    for await (const event of runCareerWorkflow("r" as RunId, { question: "Write", mode: "career", packet }, { provider, tools, model: "m", limits: PROPOSED_LIMITS, counter: { count: async () => ({ promptTokens: 100, method: "exact" }) }, permissions: () => ({ networkResearchEnabled: false }), waitForUser: async () => { throw new Error("Unexpected question"); } }, new AbortController().signal)) events.push(event);
    expect(events.find(e => e.type === "tool_failed")).toMatchObject({ callId: "current-note-1", reason: "Vault unavailable" });
    expect(events.some(e => e.type === "tool_result")).toBe(false);
    expect(events.some(e => e.type === "verified_draft")).toBe(false);
  });
});

describe("career exploration tool input repair", () => {
  const analysis = { intent: "draft", applicationQuestion: "Describe your experience", criteria: "", query: "test", requiredFacts: [] };
  const notReady = { facts: [], conflicts: [], ready: false };
  const badCall = (id: string): ModelEvent[] => [{ type: "tool_call" as const, call: { callId: id, name: "ask_user", args: {} } }, { type: "done" as const, reason: "tool_calls" as const }];
  const finished: ModelEvent[] = [{ type: "text" as const, delta: "Exploration is finished." }, { type: "done" as const, reason: "stop" as const }];
  const json = (value: unknown): ModelEvent[] => [{ type: "text" as const, delta: JSON.stringify(value) }, { type: "done" as const, reason: "stop" as const }];

  async function run(turns: ModelEvent[][]) {
    const requests: ModelRequest[] = [];
    const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* (request) { requests.push(request); const turn = turns[requests.length - 1]; if (!turn) throw new Error("Unexpected model call"); yield* turn; } };
    const events: RunEvent[] = [];
    const tools = createToolRegistry({ vault: { listNotes: () => [], readNote: async () => null }, experienceFolder: () => "", includeQuestions: true });
    const packet = { systemInstructions: "", currentNote: null, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] };
    for await (const event of runCareerWorkflow("r" as RunId, { question: "Write", mode: "career", packet }, { provider, tools, model: "m", limits: PROPOSED_LIMITS, counter: { count: async () => ({ promptTokens: 100, method: "exact" }) }, permissions: () => ({ networkResearchEnabled: false }), waitForUser: async () => { throw new Error("Unexpected question"); } }, new AbortController().signal)) events.push(event);
    return { events, requests };
  }

  it("returns one malformed tool input to the model instead of failing the run", async () => {
    const { events, requests } = await run([json(analysis), badCall("c1"), finished, json(notReady)]);
    expect(events.find(e => e.type === "tool_failed")).toMatchObject({ callId: "c1", reason: expect.stringContaining("Invalid ask_user input") });
    expect(requests[2]!.messages.at(-1)).toMatchObject({ role: "tool", callId: "c1", content: expect.stringContaining("Invalid ask_user input") });
    expect(events.find(e => e.type === "run_completed")).toMatchObject({ outcome: "incomplete" });
  });

  it("asks for exploration without hidden reasoning, which would spend the output limit unseen", async () => {
    const { requests } = await run([json(analysis), finished, json(notReady)]);
    expect(requests[1]!.tools.length).toBeGreaterThan(0);
    expect(requests[1]!.thinking).toBe(false);
  });

  it("fails the run on a second malformed input", async () => {
    const { events } = await run([json(analysis), badCall("c1"), badCall("c2")]);
    expect(events.filter(e => e.type === "tool_failed")).toHaveLength(2);
    expect(events.find(e => e.type === "run_completed")).toMatchObject({ outcome: "failed" });
  });
});
