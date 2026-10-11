/*
 * What a propose_revision result is allowed to become.
 *
 * Only a `ready` proposal for the passage the user selected may reach a preview.
 * A rejected one, a proposal for some other paragraph, or prose the model wrote
 * without calling the tool never does. Approval and application stay with the
 * PreviewController, which re-checks the document before it writes.
 */

import { z } from "zod"

import type { RunEvent } from "./events"

const TOOL = "propose_revision"

const proposal = z.object({
  status: z.enum(["ready", "rejected", "no_change"]),
  original: z.string(),
  revised: z.string(),
})

export type RevisionProposal = z.infer<typeof proposal>

const squash = (text: string) => text.replace(/\s+/g, " ").trim()

export function parseProposal(content: string): RevisionProposal | null {
  try {
    const parsed = proposal.safeParse(JSON.parse(content))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export type RevisionPreview = { ok: true; text: string } | { ok: false; reason: string }

/** The text to preview for the run's latest proposal, or the reason nothing may be previewed. */
export function revisionPreview(events: readonly RunEvent[], selection: string): RevisionPreview {
  const calls = new Set<string>()
  let result: Extract<RunEvent, { type: "tool_result" }> | undefined
  for (const event of events) {
    if (event.type === "tool_call" && event.tool === TOOL) calls.add(event.callId)
    if (event.type === "tool_result" && calls.has(event.callId)) result = event
  }
  if (!result) return { ok: false, reason: "The model did not propose a checked revision, so there is nothing to preview." }
  const latest = parseProposal(result.summary)
  if (latest?.status === "rejected") {
    return { ok: false, reason: "The proposed revision failed its fact check: it changed a number, a source or a fact you asked to keep." }
  }
  if (latest?.status !== "ready") return { ok: false, reason: "The proposed revision did not change the passage." }
  if (squash(latest.original) !== squash(selection)) {
    return { ok: false, reason: "The proposal was written for a different passage than the one selected." }
  }
  return { ok: true, text: latest.revised }
}

/** The revised text of the run's latest proposal, or null when nothing may be previewed. */
export function approvedRevision(events: readonly RunEvent[], selection: string): string | null {
  const preview = revisionPreview(events, selection)
  return preview.ok ? preview.text : null
}

/** Rejected proposals a run may receive before it ends: the first is repaired, the second ends it. */
export const MAX_REJECTED_REVISIONS = 2

export function isRejectedProposal(tool: string, content: string): boolean {
  return tool === TOOL && parseProposal(content)?.status === "rejected"
}
