/*
 * ContextPacket — the bounded, source-linked view of one model request.
 *
 * ARCHITECTURE.md keeps two things apart that are easy to conflate:
 * the canonical execution history, and the compacted request view. This is the
 * second one. Dropping something here does not erase it from the run; it only
 * means this request could not afford it.
 */

import type { EvidenceReference } from "./evidence"

export interface ContextPacket {
  readonly systemInstructions: string
  readonly currentNote: CurrentNoteContext | null
  readonly evidence: readonly EvidenceReference[]
  readonly conversation: readonly ConversationTurn[]
  /** What was left out, and why. The UI surfaces this rather than hiding it. */
  readonly omitted: readonly OmittedItem[]
}

export interface CurrentNoteContext {
  readonly path: string
  readonly title: string
  /** The selection when there is one, otherwise the note body. */
  readonly text: string
  readonly isSelection: boolean
}

export interface ConversationTurn {
  readonly role: "user" | "assistant"
  readonly text: string
}

export interface OmittedItem {
  readonly what: string
  readonly reason: "over_budget" | "duplicate" | "below_relevance"
}

/**
 * Prefix truncation is NOT Context Compression — CONTEXT.md says so directly.
 * This placeholder exists so the seam has a name and a test; the real
 * implementation lands in Phase 1 along with retrieval.
 */
export function compress(): never {
  throw new Error(
    "Context Compression is not implemented. It must retain claims, evidence and " +
      "source references — see CONTEXT.md. Do not substitute truncation."
  )
}
