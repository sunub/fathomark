/*
 * RunEvent — the only thing the Copilot UI is allowed to read.
 *
 * This is the boundary TECH_STACK.md draws around LangChain. Whatever the
 * agent loop is built from, it is translated into these events before anything
 * in src/ui sees it, so swapping the foundation is a change inside
 * src/harness rather than a rewrite of the panel.
 */

import type { EvidenceReference } from "../context/evidence"
import type { RunState } from "./run-state"

/** Correlates everything belonging to one user request. Shown in the header. */
export type RunId = string & { readonly __brand: "RunId" }

export type RunEvent =
  | { type: "state"; runId: RunId; state: RunState }
  /** One chunk of assistant prose. Never carries tool activity — see below. */
  | { type: "text"; runId: RunId; delta: string }
  /*
   * Tool activity is a separate event on purpose. PRODUCT.md acceptance
   * criterion 5: "Tool activity appears once per tool call and never becomes
   * assistant prose." Folding it into `text` is how that rule gets broken.
   */
  | { type: "tool_call"; runId: RunId; callId: string; tool: string; args: unknown }
  | { type: "tool_result"; runId: RunId; callId: string; summary: string; truncated: boolean }
  | { type: "tool_failed"; runId: RunId; callId: string; reason: string }
  /** A tool that needs explicit approval before it runs. */
  | { type: "approval_required"; runId: RunId; callId: string; tool: string; explanation: string }
  /** Evidence entered the answer. The sources panel reads these. */
  | { type: "evidence"; runId: RunId; reference: EvidenceReference }
  /*
   * Both sides of a disagreement, never a resolution. PRODUCT.md principle 7:
   * the UI does not silently choose one.
   */
  | { type: "evidence_conflict"; runId: RunId; claims: readonly EvidenceConflictClaim[] }
  | { type: "budget"; runId: RunId; usage: BudgetUsage }
  /** Actionable and persistent. Never a toast, and never disables the composer. */
  | { type: "error"; runId: RunId; message: string; recoverable: boolean }
  | { type: "usage"; runId: RunId; elapsedMs: number; tokens: number }

export interface EvidenceConflictClaim {
  readonly claim: string
  readonly reference: EvidenceReference
}

/**
 * What the budget bar draws. The segments are the evidence colours doing their
 * usual job — see Copilot/Anatomy.
 */
export interface BudgetUsage {
  readonly instructions: number
  readonly vault: number
  readonly external: number
  readonly conversation: number
  readonly toolSchemas: number
  readonly outputReserve: number
  readonly total: number
}

export type RunEventListener = (event: RunEvent) => void
