/*
 * What a tool call became, as the harness sees it.
 *
 * A failed call is not an empty result: "found nothing" tells the model to try
 * another query, "the tool broke" tells the harness to stop or repair. Keeping
 * them as separate kinds stops one from being read as the other.
 *
 * `empty` is decided by capability, not by output shape: only tools that gather
 * evidence can come back with nothing. ask_user or save_working_note citing no
 * source is normal, so they stay `content`.
 */

import type { EvidenceReference } from "../context/evidence";
import type { Capability } from "./policy";
import { ToolExecutionError, type ToolExecutionErrorCode } from "./tool-executor";

const GATHERS_EVIDENCE: ReadonlySet<Capability> = new Set([
  "search_vault",
  "read_note",
  "read_public_source",
  "wikipedia",
  "general_web",
]);

export type ToolErrorCode = ToolExecutionErrorCode | "tool_error";

export type ToolObservation =
  | { readonly kind: "content"; readonly content: string }
  /** An evidence tool ran and cited nothing. The call itself succeeded. */
  | { readonly kind: "empty"; readonly content: string }
  | {
      readonly kind: "error";
      readonly code: ToolErrorCode;
      readonly message: string;
      /** What the model reads back for this call. */
      readonly content: string;
    };

export type ToolErrorObservation = Extract<ToolObservation, { kind: "error" }>;

export function observeResult(
  capability: Capability | undefined,
  result: { readonly content: string; readonly references: readonly EvidenceReference[] },
): ToolObservation {
  const empty =
    capability !== undefined && GATHERS_EVIDENCE.has(capability) && result.references.length === 0;
  return { kind: empty ? "empty" : "content", content: result.content };
}

export function observeError(error: unknown): ToolErrorObservation {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "error",
    code: error instanceof ToolExecutionError ? error.code : "tool_error",
    message,
    content: JSON.stringify({ error: message }),
  };
}
