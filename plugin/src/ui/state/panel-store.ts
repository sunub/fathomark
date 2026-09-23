/*
 * What the panel knows, and the only two things it can ask for.
 *
 * The UI never calls the harness. It subscribes to RunEvent and invokes
 * `commands`, which copilot-view.tsx wires to the harness. That indirection is
 * the reason a component can be rendered in Storybook, or in a test, with no
 * Obsidian and no model anywhere.
 */

import type { BudgetUsage, RunEvent } from "../../harness/events"
import type { RunState } from "../../harness/run-state"

export interface ToolActivity {
  readonly callId: string
  readonly tool: string
  readonly status: "running" | "done" | "failed"
  readonly detail: string
}

export interface PanelState {
  readonly runState: RunState
  readonly answer: string
  readonly activity: readonly ToolActivity[]
  readonly usage: BudgetUsage | null
  /** Persistent and actionable. Never cleared by the next state change. */
  readonly error: string | null
  readonly elapsedMs: number | null
}

export const INITIAL_PANEL_STATE: PanelState = {
  runState: "idle",
  answer: "",
  activity: [],
  usage: null,
  error: null,
  elapsedMs: null,
}

/** What the composer can do. Both are always available — see sendSlot(). */
export interface PanelCommands {
  ask(question: string): void
  stop(): void
}

export function reduce(state: PanelState, event: RunEvent): PanelState {
  switch (event.type) {
    case "state":
      // A new run clears the previous answer; nothing else does.
      return event.state === "preparing_context"
        ? { ...INITIAL_PANEL_STATE, runState: event.state }
        : { ...state, runState: event.state }

    case "text":
      return { ...state, answer: state.answer + event.delta }

    case "tool_call":
      return {
        ...state,
        activity: [
          ...state.activity,
          { callId: event.callId, tool: event.tool, status: "running", detail: "" },
        ],
      }

    case "tool_result":
      return {
        ...state,
        activity: state.activity.map((item) =>
          item.callId === event.callId
            ? { ...item, status: "done" as const, detail: event.summary }
            : item
        ),
      }

    case "tool_failed":
      return {
        ...state,
        activity: state.activity.map((item) =>
          item.callId === event.callId
            ? { ...item, status: "failed" as const, detail: event.reason }
            : item
        ),
      }

    case "budget":
      return { ...state, usage: event.usage }

    case "error":
      return { ...state, error: event.message }

    case "usage":
      return { ...state, elapsedMs: event.elapsedMs }

    default:
      return state
  }
}
