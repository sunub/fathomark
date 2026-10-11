/*
 * save_working_note — docs/design/workflow/tools/save-working-note.md.
 *
 * Keeps the evidence table, open questions and chosen outline of one run so a
 * later step can reuse them. It is not a Vault write: the only thing it can
 * touch is the injected `WorkingNoteStore`, which the harness binds to a single
 * run. That is why the input carries no run ID or state ID — the model must not
 * choose either, and a store bound to one run cannot overwrite another run's
 * state.
 *
 * Facts and interpretations are separate arrays on purpose. A fact must cite
 * source IDs that retrieval already issued; an interpretation is only a note
 * that points at them, so a summary can never be promoted to a source.
 *
 * Not registered by `main.ts`. The design doc makes this tool optional until the
 * existing run state proves insufficient.
 */

import { z } from "zod"

import type { ToolRegistry } from "./registry"

const sourceId = z.string().regex(/^S\d+$/)

const workingNoteInput = z
  .object({
    /** The version the caller last saw. 0 for the first save of a run. */
    expectedVersion: z.number().int().min(0),
    /** Claims backed by evidence already gathered. Each keeps its original source IDs. */
    facts: z
      .array(
        z
          .object({
            claim: z.string().trim().min(1).max(300),
            sourceIds: z.array(sourceId).min(1).max(5),
          })
          .strict()
      )
      .max(20),
    /** The model's reading of the evidence. Never a source of facts. */
    interpretations: z
      .array(
        z
          .object({
            note: z.string().trim().min(1).max(300),
            relatedSourceIds: z.array(sourceId).max(5),
          })
          .strict()
      )
      .max(10),
    /** Facts the notes could not supply. */
    missing: z.array(z.string().trim().min(1).max(200)).max(10),
    outline: z.array(z.string().trim().min(1).max(150)).max(10),
  })
  .strict()

type WorkingNoteInput = z.infer<typeof workingNoteInput>

export type WorkingNoteState = Omit<WorkingNoteInput, "expectedVersion">

export type WorkingNoteSave =
  | { readonly status: "saved"; readonly stateId: string; readonly version: number }
  | { readonly status: "rejected"; readonly code: "version_conflict"; readonly currentVersion: number }
  | { readonly status: "rejected"; readonly code: "run_closed" }

/** Request-scoped store. One instance belongs to one run. */
export interface WorkingNoteStore {
  save(state: WorkingNoteState, expectedVersion: number): WorkingNoteSave
}

type WorkingNoteOutput =
  | {
      readonly status: "saved"
      readonly stateId: string
      readonly version: number
      /** Every source ID the saved facts cite, so the original attribution stays visible. */
      readonly factSourceIds: string[]
    }
  | { readonly status: "rejected"; readonly code: "version_conflict"; readonly currentVersion: number }
  | { readonly status: "rejected"; readonly code: "run_closed" }

const workingNoteOutput = z.union([
  z.object({
    status: z.literal("saved"),
    stateId: z.string(),
    version: z.number().int().min(1),
    factSourceIds: z.array(sourceId),
  }),
  z.object({
    status: z.literal("rejected"),
    code: z.literal("version_conflict"),
    currentVersion: z.number().int().min(0),
  }),
  z.object({ status: z.literal("rejected"), code: z.literal("run_closed") }),
]) as unknown as z.ZodType<WorkingNoteOutput>

/**
 * In-memory store for one run. The first version has no persistence on purpose:
 * the design doc defers app-restart recovery until retention and deletion are
 * decided.
 */
export function createMemoryWorkingNoteStore(runId: string): WorkingNoteStore & { close(): void } {
  let version = 0
  let closed = false
  let current: WorkingNoteState | null = null
  return {
    save(state, expectedVersion) {
      if (closed) return { status: "rejected", code: "run_closed" }
      if (expectedVersion !== version) {
        return { status: "rejected", code: "version_conflict", currentVersion: version }
      }
      current = state
      version += 1
      return { status: "saved", stateId: `${runId}:working-note`, version }
    },
    /** The harness calls this when the run reaches a terminal state. */
    close() {
      closed = true
      current = null
    },
  }
}

export function registerSaveWorkingNoteTool(registry: ToolRegistry, store: WorkingNoteStore): void {
  registry.register({
    name: "save_working_note",
    description:
      "Keep the evidence table, missing facts and outline of this request so later steps can reuse them. " +
      "Every fact must cite the source IDs it came from; put your own reading in interpretations, never in facts. " +
      "This does not write to the user's notes. Pass the version you last saved, or 0 the first time.",
    input: workingNoteInput,
    output: workingNoteOutput,
    parameters: {
      type: "object",
      properties: {
        expectedVersion: { type: "integer", minimum: 0 },
        facts: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              claim: { type: "string", minLength: 1, maxLength: 300 },
              sourceIds: {
                type: "array",
                items: { type: "string", pattern: "^S\\d+$" },
                minItems: 1,
                maxItems: 5,
              },
            },
            required: ["claim", "sourceIds"],
            additionalProperties: false,
          },
        },
        interpretations: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              note: { type: "string", minLength: 1, maxLength: 300 },
              relatedSourceIds: {
                type: "array",
                items: { type: "string", pattern: "^S\\d+$" },
                maxItems: 5,
              },
            },
            required: ["note", "relatedSourceIds"],
            additionalProperties: false,
          },
        },
        missing: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 200 } },
        outline: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 150 } },
      },
      required: ["expectedVersion", "facts", "interpretations", "missing", "outline"],
      additionalProperties: false,
    },
    capability: "save_working_note",
    approval: "never",
    timeoutMs: 1_000,
    resultBudgetTokens: 200,
    // Saving cites nothing new; the facts already carry the source IDs retrieval issued.
    provenance: () => [],
    run: async ({ expectedVersion, ...state }, context) => {
      context.signal.throwIfAborted()
      const result = store.save(state, expectedVersion)
      if (result.status === "rejected") return result
      return {
        ...result,
        factSourceIds: [...new Set(state.facts.flatMap((fact) => fact.sourceIds))],
      }
    },
  })
}
