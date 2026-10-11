import { z } from "zod"

import { type SemanticBackend, searchHybrid } from "./hybrid-search"
import { DEFAULT_EXPERIENCE_RULE, type ExperienceRule } from "./note-kind"
import type { ToolRegistry } from "./registry"
import type { VaultReader } from "./vault-search"
import { type VaultToolOutput, vaultOutputShape } from "./vault-output"

const searchInput = z
  .object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(10).default(5) })
  .strict()

/**
 * `supported` says whether the Vault holds enough to answer the question, so it must survive
 * output validation. It is a reading aid for the writer, not a fact check of the draft.
 */
export interface SearchVaultOutput extends VaultToolOutput {
  readonly supported: boolean
  readonly reason?: "no_match" | "below_threshold"
}

const searchOutputSchema = z.object({
  ...vaultOutputShape,
  supported: z.boolean(),
  reason: z.enum(["no_match", "below_threshold"]).optional(),
}) as unknown as z.ZodType<SearchVaultOutput>

export function registerSearchVault(
  registry: ToolRegistry,
  vault: VaultReader,
  /** Read on every call, so a changed setting applies without re-registering. */
  experienceRule: () => ExperienceRule = () => DEFAULT_EXPERIENCE_RULE,
  /** Read on every call. Undefined, or an empty index, means keyword search only. */
  semantic: () => SemanticBackend | undefined = () => undefined
): void {
  registry.register({
    name: "search_vault",
    description: "Search Markdown notes in the user's Vault for relevant paragraphs.",
    input: searchInput,
    output: searchOutputSchema,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    capability: "search_vault",
    approval: "never",
    timeoutMs: 10_000,
    resultBudgetTokens: 1_400,
    provenance: (output) => output.references,
    run: async ({ query, limit }, context) =>
      searchHybrid(vault, query, limit ?? 5, context.signal, experienceRule(), semantic()),
  })
}
