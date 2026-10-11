/*
 * What a model reply with no tool calls means.
 *
 * In chat it is the answer, so the run is complete. In career writing it is only
 * a proposal that exploration is finished: the run may move on to drafting only
 * if the evidence gathered can support it. Until a drafting stage exists, "ready"
 * is as far as a career run goes.
 *
 * The readiness rule is deliberately structural: it asks whether the user's own
 * notes were cited at all, not whether they answer the question. A semantic
 * check belongs to a later slice (docs/design/workflow/verification.md, step 2).
 */

import type { CitedEvidence } from "../context/evidence";
import type { RunMode } from "./run-input";

export type NoToolCompletion = {
  readonly outcome: "complete" | "incomplete";
  readonly reason: "stop" | "length" | "tool_calls" | "exploration_ready" | "evidence_insufficient";
};

export function completeWithoutTools(
  mode: RunMode,
  doneReason: "stop" | "length" | "tool_calls",
  citations: readonly CitedEvidence[],
): NoToolCompletion {
  if (doneReason === "length") return { outcome: "incomplete", reason: doneReason };
  if (mode === "chat") return { outcome: "complete", reason: doneReason };
  const hasOwnNotes = citations.some((cited) => cited.reference.kind === "vault");
  return hasOwnNotes
    ? { outcome: "complete", reason: "exploration_ready" }
    : { outcome: "incomplete", reason: "evidence_insufficient" };
}
