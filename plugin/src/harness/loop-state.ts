import type { CitedEvidence } from "../context/evidence";
import type { ResearchTopic } from "../context/packet";
import type { ModelMessage } from "../providers/types";
import type { ToolRegistry } from "../tools/registry";
import type { PermissionContext } from "./policy";
import type { RunStage } from "./stage";

export const MAX_MODEL_ROUNDS = 8;
export const MAX_CALLS_TOTAL = 12;
export const MAX_CALLS_PER_TOOL = 5;
/** Extra attempts for a call that timed out; other failures are not retried. */
export const MAX_TOOL_RETRIES = 1;

/** What the agent loop remembers for the length of one run. */
export interface LoopState {
  readonly history: ModelMessage[];
  citations: readonly CitedEvidence[];
  readonly announced: Set<string>;
  readonly completedCalls: Map<string, string>;
  readonly counts: Map<string, number>;
  totalCalls: number;
  repairRounds: number;
  readonly allowedWikipediaPages: Set<string>;
}

export interface ToolCallDeps {
  readonly tools: ToolRegistry;
  readonly permissions: () => PermissionContext;
  readonly researchTopic: ResearchTopic | null;
  readonly stage: RunStage;
  readonly signal: AbortSignal;
}

export type ToolStopReason = "tool_limit" | "tool_error";

/** Why the tool phase ended the whole run. */
export interface ToolStop {
  readonly outcome: "incomplete" | "failed";
  readonly reason: ToolStopReason;
}
