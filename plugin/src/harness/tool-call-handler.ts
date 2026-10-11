import { registerEvidence } from "../context/evidence";
import type { ModelToolCall } from "../providers/types";
import type { ToolExecutionContext } from "../tools/registry";
import type { RunEvent, RunId } from "./events";
import {
  MAX_CALLS_PER_TOOL,
  MAX_CALLS_TOTAL,
  MAX_TOOL_RETRIES,
  type LoopState,
  type ToolCallDeps,
  type ToolStop,
} from "./loop-state";
import { observeError, observeResult, type ToolErrorObservation } from "./observation";
import { executeTool } from "./tool-executor";

/** Reads state only; the caller records an invalid input before asking. */
function endsRunAfterToolError(error: ToolErrorObservation, state: LoopState): boolean {
  if (error.code === "invalid_input") return state.repairRounds > 1;
  return error.code !== "permission_denied";
}

/** A timeout is the one failure worth repeating; a repeat that is cancelled is not. */
async function executeWithRetry(
  call: ModelToolCall,
  deps: ToolCallDeps,
  context: ToolExecutionContext,
  beforeRetry: () => void,
): ReturnType<typeof executeTool> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await executeTool(call, deps.tools, deps.permissions, context, deps.stage);
    } catch (error) {
      const retryable = observeError(error).code === "timeout";
      if (!retryable || attempt >= MAX_TOOL_RETRIES || deps.signal.aborted) throw error;
      beforeRetry();
    }
  }
}

export async function* handleToolCall(
  runId: RunId,
  call: ModelToolCall,
  state: LoopState,
  deps: ToolCallDeps,
): AsyncGenerator<RunEvent, ToolStop | null, undefined> {
  state.totalCalls++;
  const toolCount = (state.counts.get(call.name) ?? 0) + 1;
  state.counts.set(call.name, toolCount);

  if (toolCount > MAX_CALLS_PER_TOOL || state.totalCalls > MAX_CALLS_TOTAL) {
    const reason =
      toolCount > MAX_CALLS_PER_TOOL
        ? `${call.name} exceeded the limit of ${MAX_CALLS_PER_TOOL} calls.`
        : `This run exceeded the limit of ${MAX_CALLS_TOTAL} tool calls.`;
    yield { type: "tool_failed", runId, callId: call.callId, reason };
    return { outcome: "incomplete", reason: "tool_limit" };
  }

  const previous = state.completedCalls.get(call.callId);
  if (previous !== undefined) {
    state.history.push({ role: "tool", callId: call.callId, content: previous });
    return null;
  }

  const researchQueries: Array<{ query: string; language: "ko" | "en" }> = [];
  const context: ToolExecutionContext = {
    signal: deps.signal,
    researchTopic: deps.researchTopic,
    allowedWikipediaPages: state.allowedWikipediaPages,
    permissions: deps.permissions,
    onResearchQuery: (query, language) => researchQueries.push({ query, language }),
  };

  try {
    const result = await executeWithRetry(call, deps, context, () => {
      researchQueries.length = 0;
    });
    for (const query of researchQueries) {
      yield { type: "research_query", runId, query: query.query, language: query.language };
    }

    const observation = observeResult(deps.tools.get(call.name)?.capability, result);
    state.completedCalls.set(call.callId, observation.content);
    state.history.push({ role: "tool", callId: call.callId, content: observation.content });
    yield {
      type: "tool_result",
      runId,
      callId: call.callId,
      summary: observation.content,
      truncated: false,
    };

    const updated = registerEvidence(state.citations, result.references);
    for (const cited of updated.slice(state.citations.length)) {
      yield { type: "evidence", runId, sourceId: cited.sourceId, reference: cited.reference };
    }

    state.citations = updated;
    return null;
  } catch (error) {
    const observation = observeError(error);
    state.history.push({ role: "tool", callId: call.callId, content: observation.content });

    yield { type: "tool_failed", runId, callId: call.callId, reason: observation.message };
    if (observation.code === "invalid_input") state.repairRounds += 1;
    return endsRunAfterToolError(observation, state) ? { outcome: "failed", reason: "tool_error" } : null;
  }
}
