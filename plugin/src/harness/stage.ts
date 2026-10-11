/*
 * Run stages — docs/design/workflow/agent-loop.md.
 *
 * Registered tools are what is installed; a stage decides which of them the model
 * is offered and may call right now. Exploration gathers evidence and must not
 * produce a proposal that could become an approvable preview, so it withholds
 * propose_revision. A run is a revision only when the user chose a passage to
 * revise; the app decides that, never the model.
 */

export type RunStage = "explore" | "revise"

const WITHHELD: Record<RunStage, readonly string[]> = {
  explore: ["propose_revision"],
  revise: [],
}

export function isToolInStage(name: string, stage: RunStage): boolean {
  return !WITHHELD[stage].includes(name)
}
