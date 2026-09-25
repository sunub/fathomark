/*
 * The run state machine from docs/ARCHITECTURE.md.
 *
 * Three rules this module exists to enforce, all of them product rules rather
 * than implementation details:
 *
 *  1. Terminal outcomes are not loading states. `complete`, `incomplete`,
 *     `cancelled` and `failed` all return the panel to input-ready.
 *  2. No state permanently disables input. There is no path to a dead panel.
 *  3. Every transition is declared here, so an illegal one is a type error
 *     rather than a UI that quietly gets stuck.
 */

export type ActiveRunState =
  | "preparing_context"
  | "waiting_for_model"
  | "streaming"
  | "waiting_for_tool_approval"
  | "executing_tool"
  | "preparing_answer"

export type TerminalRunState = "complete" | "incomplete" | "cancelled" | "failed"

export type RunState = "idle" | ActiveRunState | TerminalRunState

const TERMINAL: readonly TerminalRunState[] = [
  "complete",
  "incomplete",
  "cancelled",
  "failed",
]

export function isTerminal(state: RunState): state is TerminalRunState {
  return (TERMINAL as readonly RunState[]).includes(state)
}

/** A run is doing something the user should be able to stop. */
export function isActive(state: RunState): state is ActiveRunState {
  return state !== "idle" && !isTerminal(state)
}

/**
 * The composer is never disabled — see Chat/Anatomy, "컴포저를 런 컨트롤로
 * 대체하는 것". What changes is only what sits in the send slot.
 */
export function sendSlot(state: RunState): "send" | "stop" {
  return isActive(state) ? "stop" : "send"
}

const TRANSITIONS: Record<RunState, readonly RunState[]> = {
  idle: ["preparing_context"],
  preparing_context: ["waiting_for_model", "cancelled", "failed"],
  waiting_for_model: ["streaming", "waiting_for_tool_approval", "cancelled", "failed"],
  streaming: [
    "waiting_for_tool_approval",
    "executing_tool",
    "preparing_answer",
    "cancelled",
    "failed",
  ],
  waiting_for_tool_approval: ["executing_tool", "preparing_answer", "cancelled", "failed"],
  executing_tool: ["waiting_for_model", "preparing_answer", "cancelled", "failed"],
  preparing_answer: ["complete", "incomplete", "cancelled", "failed"],
  // Every terminal state goes back to a new run, and nowhere else.
  complete: ["preparing_context"],
  incomplete: ["preparing_context"],
  cancelled: ["preparing_context"],
  failed: ["preparing_context"],
}

export function canTransition(from: RunState, to: RunState): boolean {
  return TRANSITIONS[from].includes(to)
}

export class IllegalTransitionError extends Error {
  constructor(from: RunState, to: RunState) {
    super(`A run cannot go from ${from} to ${to}.`)
    this.name = "IllegalTransitionError"
  }
}

export function transition(from: RunState, to: RunState): RunState {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to)
  return to
}
