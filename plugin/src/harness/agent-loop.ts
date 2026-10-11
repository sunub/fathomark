import { registerEvidence } from "../context/evidence";
import { buildRequest } from "../context/request";
import type {
  ModelProvider,
  ModelRequest,
  ModelToolCall,
  RequestCounter,
} from "../providers/types";
import type { ToolRegistry } from "../tools/registry";
import type { BudgetLimits } from "./budget";
import type { RunEvent, RunId } from "./events";
import type { RunInput } from "./run-input";
import { decide, type PermissionContext } from "./policy";
import { raceWithSignal } from "./abort";
import { handleToolCall } from "./tool-call-handler";
import { completeWithoutTools } from "./completion";
import { isToolInStage, type RunStage } from "./stage";
import { MAX_MODEL_ROUNDS, type LoopState, type ToolCallDeps } from "./loop-state";

interface LoopOptions {
  readonly provider: ModelProvider;
  readonly model: string;
  readonly tools: ToolRegistry;
  readonly limits: BudgetLimits;
  readonly counter: RequestCounter;
  readonly permissions: () => PermissionContext;
}

type ModelRound = {
  readonly calls: readonly ModelToolCall[];
  readonly assistantText: string;
  readonly doneReason: "stop" | "length" | "tool_calls";
};

async function* streamModelRound(
  runId: RunId,
  provider: ModelProvider,
  request: ModelRequest,
  announced: Set<string>,
  signal: AbortSignal,
): AsyncGenerator<RunEvent, ModelRound, undefined> {
  const calls: ModelToolCall[] = [];
  let assistantText = "";
  let doneReason: ModelRound["doneReason"] | null = null;
  const iterator = provider.stream(request, signal)[Symbol.asyncIterator]();

  while (true) {
    const next = await raceWithSignal(iterator.next(), signal);
    if (next.done) {
      break;
    }

    const event = next.value;
    signal.throwIfAborted();

    if (event.type === "text") {
      assistantText += event.delta;
      yield { type: "text", runId, delta: event.delta };
    }

    if (event.type === "tool_call") {
      calls.push(event.call);

      if (announced.has(event.call.callId)) {
        continue;
      }

      announced.add(event.call.callId);
      yield {
        type: "tool_call",
        runId,
        callId: event.call.callId,
        tool: event.call.name,
        args: event.call.args,
      };
    }

    doneReason = event.type === "done" ? event.reason : doneReason;
  }
  if (doneReason === null) {
    throw new Error("The model stream ended without a completion event.");
  }
  return { calls, assistantText, doneReason };
}

/** The tools the model may see right now: installed, in this stage, and permitted. */
export function offeredTools(
  tools: ToolRegistry,
  stage: RunStage,
  permissions: PermissionContext,
): ModelRequest["tools"] {
  return tools
    .definitions()
    .filter((tool) => isToolInStage(tool.name, stage) && decide(tool.capability, permissions).allowed)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
}

function createLoopState(input: RunInput): LoopState {
  return {
    history: input.packet.conversation.map((turn) => ({ role: turn.role, content: turn.text })),
    citations: registerEvidence([], input.packet.evidence),
    announced: new Set(),
    completedCalls: new Map(),
    counts: new Map(),
    totalCalls: 0,
    repairRounds: 0,
    allowedWikipediaPages: new Set(),
  };
}

export async function* runAgentLoop(
  runId: RunId,
  input: RunInput,
  options: LoopOptions,
  signal: AbortSignal,
): AsyncIterable<RunEvent> {
  const state = createLoopState(input);
  const stage = input.stage ?? "explore";
  const deps: ToolCallDeps = {
    tools: options.tools,
    permissions: options.permissions,
    researchTopic: input.packet.researchTopic,
    stage,
    signal,
  };

  for (let round = 0; round < MAX_MODEL_ROUNDS; round += 1) {
    signal.throwIfAborted();
    // Offered per request, so a changed setting applies from the next one. A
    // hidden tool named anyway is still refused by executeTool's permission check.
    const toolSchemas = offeredTools(options.tools, stage, options.permissions());
    const { request, usage } = await buildRequest(
      input,
      state.history,
      state.citations,
      toolSchemas,
      options.limits,
      options.counter,
      options.model,
    );
    yield { type: "budget", runId, usage };

    const { calls, assistantText, doneReason } = yield* streamModelRound(
      runId,
      options.provider,
      request,
      state.announced,
      signal,
    );
    if (calls.length === 0) {
      yield { type: "run_completed", runId, ...completeWithoutTools(input.mode ?? "chat", doneReason, state.citations) };
      return;
    }

    state.history.push({ role: "assistant", content: assistantText, toolCalls: calls });
    for (const call of calls) {
      const stop = yield* handleToolCall(runId, call, state, deps);
      if (stop) {
        yield { type: "run_completed", runId, ...stop };
        return;
      }
    }
  }

  yield {
    type: "error",
    runId,
    message: `The model reached the limit of ${MAX_MODEL_ROUNDS} rounds.`,
    recoverable: true,
  };
  yield { type: "run_completed", runId, outcome: "failed", reason: "model_round_limit" };
}
