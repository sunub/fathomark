/*
 * ask_user — docs/design/workflow/tools/ask-user.md.
 *
 * The tool only builds the question request and returns at once. It never
 * waits for the answer: the harness owns the waiting state, assigns the
 * question ID, and completes the call once a valid answer arrives. Nothing here
 * is a run ID or question ID, because the model must not choose either.
 *
 * Not registered by `main.ts` on purpose. Until the harness can park a run on
 * `waiting_for_user`, the executor would hand this request to the model as if it
 * were the user's answer.
 */

import { z } from "zod"

import type { ToolRegistry } from "./registry"

const MAX_OPTIONS = 4

const askUserInput = z
  .object({
    /** The fact the notes and the conversation could not supply. */
    missing: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(300),
    options: z.array(z.string().trim().min(1).max(100)).min(2).max(MAX_OPTIONS).optional(),
    /** Evidence already gathered that makes the question necessary, e.g. "S2". */
    relatedSourceIds: z.array(z.string().regex(/^S\d+$/)).max(5).optional(),
  })
  .strict()

type AskUserInput = z.infer<typeof askUserInput>

interface AskUserOutput {
  readonly status: "question_requested"
  readonly request: AskUserInput
}

const askUserOutput = z.object({
  status: z.literal("question_requested"),
  request: askUserInput,
}) as unknown as z.ZodType<AskUserOutput>

export function registerAskUserTool(registry: ToolRegistry): void {
  registry.register({
    name: "ask_user",
    description:
      "Ask the user for a fact about their own role, actions or results, or for a choice that changes the draft, " +
      "when the notes and the conversation cannot answer it. Do not ask just because several candidates exist, " +
      "and do not repeat a question the user already answered.",
    input: askUserInput,
    output: askUserOutput,
    parameters: {
      type: "object",
      properties: {
        missing: { type: "string", minLength: 1, maxLength: 200 },
        question: { type: "string", minLength: 1, maxLength: 300 },
        options: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 100 },
          minItems: 2,
          maxItems: MAX_OPTIONS,
        },
        relatedSourceIds: {
          type: "array",
          items: { type: "string", pattern: "^S\\d+$" },
          maxItems: 5,
        },
      },
      required: ["missing", "question"],
      additionalProperties: false,
    },
    capability: "ask_user",
    approval: "never",
    timeoutMs: 1_000,
    resultBudgetTokens: 300,
    // A question is not evidence. The user's answer gets its own reference kind later.
    provenance: () => [],
    run: async (input, context) => {
      context.signal.throwIfAborted()
      return { status: "question_requested" as const, request: input }
    },
  })
}
