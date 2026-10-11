import { describe, expect, it } from "vitest";
import { runCareerWorkflow } from "../src/workflow/career-graph";
import { createToolRegistry } from "../src/tools/create-registry";
import type { RunEvent, RunId } from "../src/harness/events";
import type { ModelProvider } from "../src/providers/types";
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
