/*
 * What the panel knows, and the only two things it can ask for.
 *
 * The UI never calls the harness. It subscribes to RunEvent and invokes
 * `commands`, which chat-view.tsx wires to the harness. That indirection is
 * the reason a component can be rendered in Storybook, or in a test, with no
 * Obsidian and no model anywhere.
 */

import type { EvidenceReference } from "../../context/evidence"
import type { CurrentNoteContext } from "../../context/packet"
import type { BudgetUsage, EvidenceConflictClaim, RunEvent } from "../../harness/events"
import type { InsertionPreview } from "../../context/insertion"
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
  readonly question: string | null
  readonly currentNote: CurrentNoteContext | null
  readonly evidence: ReadonlyMap<string, EvidenceReference>
  readonly conflicts: readonly EvidenceConflictClaim[]
}

export const INITIAL_PANEL_STATE: PanelState = {
  runState: "idle",
  answer: "",
  activity: [],
  usage: null,
  error: null,
  elapsedMs: null,
  question: null,
  currentNote: null,
  evidence: new Map(),
  conflicts: [],
}

/** What the composer can do. Both are always available — see sendSlot(). */
export interface PanelCommands {
  ask(question: string): Promise<{ accepted: boolean; reason?: string }>
  stop(): void
  retry(): Promise<{ accepted: boolean; reason?: string }>
  openSource(reference: EvidenceReference): Promise<void>
  setResearchTopic(text: string, language: "ko" | "en"): void
  selectStyle(): Promise<void>
  clearStyle(): Promise<void>
  saveStyle(): Promise<void>
  previewAnswer(): InsertionPreview | null
  approveInsertion(id: string): InsertionPreview | null
  discardInsertion(id: string): InsertionPreview | null
}

export function reduce(state: PanelState, event: RunEvent): PanelState {
  switch (event.type) {
    case "run_started":
      return {
        ...INITIAL_PANEL_STATE,
        question: event.question,
        currentNote: event.currentNote,
      }

    case "state":
      // A new run clears the previous answer; nothing else does.
      return event.state === "preparing_context"
        ? { ...INITIAL_PANEL_STATE, runState: event.state }
        : { ...state, runState: event.state }

    case "text":
      return { ...state, answer: state.answer + event.delta }

    case "tool_call":
      if (state.activity.some((item) => item.callId === event.callId)) return state
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

    case "evidence": {
      const evidence = new Map(state.evidence)
      evidence.set(event.sourceId, event.reference)
      return { ...state, evidence }
    }

    case "evidence_conflict":
      return { ...state, conflicts: [...state.conflicts, ...event.claims] }

    default:
      return state
  }
}
