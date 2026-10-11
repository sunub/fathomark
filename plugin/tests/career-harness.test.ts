import { describe, expect, it, vi } from "vitest";
import { AgentHarness } from "../src/harness/harness";
import { PROPOSED_LIMITS } from "../src/harness/budget";
import { fakeRequestCounter } from "../src/providers/fake";
import type { ModelProvider } from "../src/providers/types";
import type { RunEvent } from "../src/harness/events";
import { ToolRegistry } from "../src/tools/registry";

const packet = { systemInstructions: "s", currentNote: null, style: null, researchTopic: null, evidence: [], conversation: [], omitted: [] };
function fixture() {
  const calls = vi.fn();
  const provider: ModelProvider = { id: "scripted", health: async () => ({ reachable: true, detail: "ok" }), listModels: async () => [], stream: async function* () { calls(); yield { type: "text", delta: JSON.stringify({ intent: "unclear", applicationQuestion: "", criteria: "", query: "test", requiredFacts: [] }) }; yield { type: "done", reason: "stop" }; } };
  const harness = new AgentHarness({ provider, model: "m", tools: new ToolRegistry(), counter: fakeRequestCounter, limits: PROPOSED_LIMITS, permissions: () => ({ networkResearchEnabled: false }), runTimeoutMs: 100 });
  const events: RunEvent[] = [];
  harness.subscribe(e => events.push(e));
  return { harness, events, calls };
}

describe("same-run question waiting", () => {
  it("pauses the timer and stops calls; cancellation discards a late answer", async () => {
    vi.useFakeTimers();
    try {
      const { harness, events, calls } = fixture();
      const running = harness.run({ question: "help", mode: "career", packet });
      await vi.waitFor(() => expect(harness.currentState()).toBe("waiting_for_user"));
      const question = events.find(e => e.type === "question_requested");
      expect(question?.type).toBe("question_requested");
      await vi.advanceTimersByTimeAsync(1000);
      expect(harness.currentState()).toBe("waiting_for_user");
      expect(calls).toHaveBeenCalledTimes(1);
      harness.cancel();
      await running;
      expect(harness.currentState()).toBe("cancelled");
      if (question?.type === "question_requested") expect(harness.answerQuestion(question.questionId, "문단 수정").accepted).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it("rejects unknown and duplicate answers without starting a new run", async () => {
    const { harness, events } = fixture();
    const running = harness.run({ question: "help", mode: "career", packet });
    await vi.waitFor(() => expect(harness.currentState()).toBe("waiting_for_user"));
    const question = events.find(e => e.type === "question_requested");
    expect(harness.answerQuestion("other", "문단 수정").accepted).toBe(false);
    if (question?.type === "question_requested") {
      expect(harness.answerQuestion(question.questionId, "문단 수정").accepted).toBe(true);
      expect(harness.answerQuestion(question.questionId, "문단 수정").accepted).toBe(false);
    }
    harness.cancel();
    await running;
    expect(events.filter(e => e.type === "run_started")).toHaveLength(1);
  });
});
