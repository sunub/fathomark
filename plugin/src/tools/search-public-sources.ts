/*
 * search_public_sources — docs/design/workflow/tools/search-public-sources.md.
 *
 * Finds candidate public pages about a company, role or industry. A candidate's
 * summary only helps pick what to read; it is not evidence. Confirming a claim
 * takes `read_public_source`.
 *
 * Not registered by `main.ts`, and it declares `general_web`, which `decide`
 * refuses. Both are on purpose: the doc says the search provider and the
 * permission contract are still undecided, so the tool takes a `PublicSourceSearcher`
 * and knows nothing about a vendor, an API key or `fetch`. Allowing it later is a
 * deliberate change in `policy.ts`, not a side effect of registering this file.
 *
 * Egress is checked here, before the searcher is called, because a query cannot
 * be recalled once sent (ADR 0004). The vault-only terms come from the harness;
 * the model never supplies or widens them.
 *
 * Like `read_public_source`, results carry no evidence references.
 * `ExternalEvidenceReference` is Wikipedia-only, so widening it is a separate
 * decision that reaches the sources panel and the request builder.
 *
 * Call count, query changes and retries are the harness's limits (`CallLimiter`).
 * Recording the sent query and the candidates chosen belongs to the searcher the
 * harness injects, so the shared `ToolExecutionContext` stays free of it.
 */

import { z } from "zod"

import type { ToolRegistry } from "./registry"

const MAX_LIMIT = 5
const MAX_QUERY_LENGTH = 120
const MAX_SUMMARY_LENGTH = 400

const SCOPES = ["company", "role", "industry"] as const
type Scope = (typeof SCOPES)[number]

export interface PublicCandidate {
  readonly candidateId: string
  readonly title: string
  readonly url: string
  /** The search snippet. Data to choose from, never a fact to cite. */
  readonly summary: string
  readonly publisher: string
  /** True only when the publisher is the subject itself, such as a company's own site. */
  readonly official: boolean
  /** ISO 8601 date the provider reported. Absent when it did not report one. */
  readonly publishedAt?: string
}

export type PublicSearchOutcome =
  | { readonly status: "ok"; readonly candidates: readonly PublicCandidate[] }
  | { readonly status: "limit_exhausted" }

/** The one search this tool is given. The harness owns the provider and the query log. */
export interface PublicSourceSearcher {
  search(request: { query: string; scope: Scope; limit: number }, signal: AbortSignal): Promise<PublicSearchOutcome>
}

export interface SearchPublicSourcesOptions {
  /** Names, phrases and paths found only in the vault. A query containing one is not sent. */
  readonly vaultOnlyTerms: () => readonly string[]
}

const searchInput = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    scope: z.enum(SCOPES),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict()

type ErrorCode = "egress_blocked" | "service_error" | "limit_exhausted"

interface SearchPublicSourcesOutput {
  readonly candidates: readonly PublicCandidate[]
  readonly omitted: string[]
  readonly error?: { readonly code: ErrorCode; readonly message: string }
}

const candidateSchema = z.object({
  candidateId: z.string(),
  title: z.string(),
  url: z.string(),
  summary: z.string(),
  publisher: z.string(),
  official: z.boolean(),
  publishedAt: z.string().optional(),
})

const searchOutput = z.object({
  candidates: z.array(candidateSchema),
  omitted: z.array(z.string()),
  error: z
    .object({ code: z.enum(["egress_blocked", "service_error", "limit_exhausted"]), message: z.string() })
    .optional(),
}) as unknown as z.ZodType<SearchPublicSourcesOutput>

export function registerSearchPublicSourcesTool(
  registry: ToolRegistry,
  searcher: PublicSourceSearcher,
  options: SearchPublicSourcesOptions
): void {
  registry.register({
    name: "search_public_sources",
    description:
      "Search public pages about a company, role or industry the user asked to research, " +
      "only when the pasted sources and notes cannot answer it. " +
      "The query is sent off-device: write it from public facts only, never from vault text, note names or paths. " +
      "Results are candidates. A summary is not evidence; choose one and read it with read_public_source. " +
      "Prefer official sources. An empty list means nothing relevant was found, and an error means the search did not happen.",
    input: searchInput,
    output: searchOutput,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: MAX_QUERY_LENGTH },
        scope: { type: "string", enum: [...SCOPES] },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
      },
      required: ["query", "scope"],
      additionalProperties: false,
    },
    capability: "general_web",
    approval: "never",
    timeoutMs: 10_000,
    resultBudgetTokens: 2_000,
    provenance: () => [],
    run: async (input, context) => {
      context.signal.throwIfAborted()
      const blocked = egressProblem(input.query, options.vaultOnlyTerms())
      if (blocked) return failure("egress_blocked", blocked)

      const limit = input.limit ?? MAX_LIMIT
      let outcome: PublicSearchOutcome
      try {
        outcome = await searcher.search({ query: input.query, scope: input.scope, limit }, context.signal)
      } catch (error) {
        // A Stop is not a failed search; let the harness report it as cancelled.
        context.signal.throwIfAborted()
        return failure("service_error", `The search service failed: ${error instanceof Error ? error.message : "unknown error"}`)
      }
      context.signal.throwIfAborted()

      if (outcome.status === "limit_exhausted") {
        return failure("limit_exhausted", "The public search limit for this run is used up. Ask the user for sources.")
      }
      return boundedCandidates(outcome.candidates, limit)
    },
  })
}

/** Returns why the query must not leave the device, or null when it may be sent. */
function egressProblem(query: string, vaultOnlyTerms: readonly string[]): string | null {
  const value = query.normalize("NFKC")
  if (/[\u0000-\u001F\u007F]/.test(value)) return "Control characters are not allowed in a public query."
  if (/\b(?:https?:\/\/|www\.)/i.test(value) || /[\\/]/.test(value) || /\.md\b/i.test(value)) {
    return "URLs and file paths are not public queries."
  }
  const lowered = value.toLowerCase()
  for (const term of vaultOnlyTerms) {
    const needle = term.normalize("NFKC").trim().toLowerCase()
    if (needle.length > 0 && lowered.includes(needle)) {
      return "The query contains text found only in the vault, so it was not sent. Rewrite it from public facts."
    }
  }
  return null
}

function failure(code: ErrorCode, message: string): SearchPublicSourcesOutput {
  return { candidates: [], omitted: [], error: { code, message } }
}

/** Keeps https candidates up to the limit; a result with no usable address is dropped and counted, not guessed at. */
function boundedCandidates(candidates: readonly PublicCandidate[], limit: number): SearchPublicSourcesOutput {
  const omitted: string[] = []
  const kept: PublicCandidate[] = []
  let unusable = 0
  for (const candidate of candidates) {
    if (!isHttps(candidate.url)) {
      unusable += 1
      continue
    }
    kept.push({ ...candidate, summary: candidate.summary.slice(0, MAX_SUMMARY_LENGTH) })
  }
  if (unusable > 0) omitted.push(`${unusable} result(s) were dropped because they had no https address.`)
  if (kept.length > limit) omitted.push(`${kept.length - limit} result(s) were omitted by the limit of ${limit}.`)
  return { candidates: kept.slice(0, limit), omitted }
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}
