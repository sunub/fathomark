/*
 * The request context budget.
 *
 * The numbers below are the PROPOSAL in docs/MODEL_SELECTION.md, not an accepted
 * decision — docs/NEXT_SESSION.md lists "Model context and output budget" as the
 * first unresolved decision, and it has to be tested against the real flow,
 * Korean tokenisation, tool-message preservation and evidence recall. They live
 * in one place so that resolving that decision is an edit here rather than a
 * search across the harness.
 */

import type { BudgetUsage } from "./events"

export interface BudgetLimits {
  /** The smallest native model context Fathomark will run against. */
  readonly modelContext: number
  /** The default request view, well under modelContext on a 16 GB machine. */
  readonly requestView: number
  /** Held back for the answer, never spent on evidence. */
  readonly outputReserve: number
  /** Slack for tokeniser disagreement between our count and the provider's. */
  readonly safetyMargin: number
}

export const PROPOSED_LIMITS: BudgetLimits = {
  modelContext: 16_000,
  requestView: 8_000,
  outputReserve: 1_400,
  safetyMargin: 256,
}

/** What evidence and conversation may actually occupy. */
export function spendable(limits: BudgetLimits): number {
  return limits.requestView - limits.outputReserve - limits.safetyMargin
}

export function totalUsed(usage: BudgetUsage): number {
  return (
    usage.instructions +
    usage.vault +
    usage.external +
    usage.conversation +
    usage.toolSchemas +
    usage.outputReserve
  )
}

export function isOverBudget(usage: BudgetUsage, limits: BudgetLimits): boolean {
  return totalUsed(usage) > limits.requestView - limits.safetyMargin
}

export function emptyUsage(limits: BudgetLimits): BudgetUsage {
  return {
    instructions: 0,
    vault: 0,
    external: 0,
    conversation: 0,
    toolSchemas: 0,
    outputReserve: limits.outputReserve,
    total: limits.requestView,
  }
}
