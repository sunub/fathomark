/*
 * propose_revision — docs/design/workflow/tools/propose-revision.md.
 *
 * The calling model writes the revised text; this tool does not call a model and
 * cannot write to a note. It checks, in code, that the revision did not invent or
 * change a fact, and returns the before/after pair with what the check found.
 * Whether a proposal may become a preview is decided from `status`:
 * only `ready` may, and `rejected` must never be shown as approvable.
 *
 * What the checks can and cannot see. Numbers are compared as written, so "30%"
 * turning into "35%" is caught, but a number spelled in words is not. A required
 * fact is matched as an exact phrase. Role and outcome wording beyond that is not
 * judged here; claim verification is the later, model-based step.
 *
 * Registered, but withheld in the exploration stage (harness/stage): only a run on a
 * passage the user chose may offer or execute it.
 */

import { z } from "zod"

import type { ToolRegistry } from "./registry"

const CITATION = /\[\[S\d+\]\]/g
const NUMBER = /\d+(?:[.,]\d+)*\s?(?:%|퍼센트)?/g

const proposeInput = z
  .object({
    /** The paragraph being revised, exactly as it is in the draft. */
    original: z.string().trim().min(1).max(2000),
    /** The model's rewritten paragraph. */
    revised: z.string().trim().min(1).max(2000),
    /** What the user asked for, e.g. "shorter". Echoed back so the preview can show it. */
    criteria: z.string().trim().min(1).max(200),
    /** Phrases that must survive unchanged, such as the user's role or an outcome. */
    keepFacts: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  })
  .strict()

const issueSchema = z.object({
  severity: z.enum(["blocking", "review"]),
  code: z.enum([
    "added_number",
    "missing_keep_fact",
    "added_citation",
    "dropped_number",
    "dropped_citation",
  ]),
  detail: z.string(),
})

const outputSchema = z.object({
  /** `ready`: no blocking issue. `rejected`: a fact may have changed. `no_change`: nothing to preview. */
  status: z.enum(["ready", "rejected", "no_change"]),
  original: z.string(),
  revised: z.string(),
  criteria: z.string(),
  issues: z.array(issueSchema),
})

export type ProposeRevisionOutput = z.infer<typeof outputSchema>
type Issue = z.infer<typeof issueSchema>

const squash = (text: string) => text.replace(/\s+/g, " ").trim()

function numbersIn(text: string): Set<string> {
  const found = text.replace(CITATION, " ").match(NUMBER) ?? []
  return new Set(found.map((value) => value.replace(/\s/g, "")))
}

function citationsIn(text: string): Set<string> {
  return new Set(text.match(CITATION) ?? [])
}

function missingFrom(source: ReadonlySet<string>, other: ReadonlySet<string>): string[] {
  return [...source].filter((item) => !other.has(item))
}

export function checkRevision(input: z.infer<typeof proposeInput>): ProposeRevisionOutput {
  const original = squash(input.original)
  const revised = squash(input.revised)
  const base = { original: input.original, revised: input.revised, criteria: input.criteria }
  if (original === revised) return { ...base, status: "no_change", issues: [] }

  const issues: Issue[] = []
  const originalNumbers = numbersIn(original)
  const revisedNumbers = numbersIn(revised)
  for (const value of missingFrom(revisedNumbers, originalNumbers)) {
    issues.push({ severity: "blocking", code: "added_number", detail: `${value} is not in the original.` })
  }
  for (const value of missingFrom(originalNumbers, revisedNumbers)) {
    issues.push({ severity: "review", code: "dropped_number", detail: `${value} was in the original.` })
  }

  const originalCitations = citationsIn(original)
  const revisedCitations = citationsIn(revised)
  for (const value of missingFrom(revisedCitations, originalCitations)) {
    issues.push({ severity: "blocking", code: "added_citation", detail: `${value} was not cited in the original.` })
  }
  for (const value of missingFrom(originalCitations, revisedCitations)) {
    issues.push({ severity: "review", code: "dropped_citation", detail: `${value} was cited in the original.` })
  }

  for (const fact of input.keepFacts) {
    if (!revised.includes(squash(fact))) {
      issues.push({ severity: "blocking", code: "missing_keep_fact", detail: `"${fact}" must stay in the text.` })
    }
  }

  const blocked = issues.some((issue) => issue.severity === "blocking")
  return { ...base, status: blocked ? "rejected" : "ready", issues }
}

export function registerProposeRevisionTool(registry: ToolRegistry): void {
  registry.register({
    name: "propose_revision",
    description:
      "Check a rewritten paragraph against the original before it is previewed. " +
      "Pass the original, your rewrite and the user's criteria. Never add facts or numbers; " +
      "if the rewrite needs one the notes do not give, ask the user instead. " +
      "A rejected proposal cannot be shown for approval.",
    input: proposeInput,
    output: outputSchema,
    parameters: {
      type: "object",
      properties: {
        original: { type: "string", minLength: 1, maxLength: 2000 },
        revised: { type: "string", minLength: 1, maxLength: 2000 },
        criteria: { type: "string", minLength: 1, maxLength: 200 },
        keepFacts: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 100 },
          maxItems: 10,
          default: [],
        },
      },
      required: ["original", "revised", "criteria"],
      additionalProperties: false,
    },
    capability: "propose_revision",
    approval: "never",
    timeoutMs: 1_000,
    resultBudgetTokens: 1_400,
    // The proposal is the model's own text, not evidence.
    provenance: () => [],
    run: async (input, context) => {
      context.signal.throwIfAborted()
      return checkRevision(input)
    },
  })
}
