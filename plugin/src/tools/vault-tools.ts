import { z } from "zod"

import type { VaultEvidenceReference } from "../context/evidence"
import type { ToolRegistry } from "./registry"
import { type VaultReader, excerptForHeading, searchVault } from "./vault-search"

export type { VaultReader } from "./vault-search"

const safeMarkdownPath = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path), "Absolute paths are not allowed.")
  .refine((path) => !path.replace(/\\/g, "/").split("/").includes(".."), "Parent traversal is not allowed.")
  .refine((path) => path.toLocaleLowerCase().endsWith(".md"), "Only Markdown notes can be read.")

const searchInput = z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(10).default(5) }).strict()
const readInput = z.object({ path: safeMarkdownPath, heading: z.string().trim().min(1).max(200).optional() }).strict()
const referenceSchema = z.object({
  kind: z.literal("vault"),
  path: z.string(),
  heading: z.string().optional(),
  excerpt: z.string(),
})
const errorSchema = z.object({ code: z.literal("not_found"), message: z.string() })
interface VaultToolOutput {
  readonly references: VaultEvidenceReference[]
  readonly omitted: string[]
  readonly error?: { readonly code: "not_found"; readonly message: string }
}
const outputSchema = z.object({
  references: z.array(referenceSchema),
  omitted: z.array(z.string()),
  error: errorSchema.optional(),
}) as unknown as z.ZodType<VaultToolOutput>

export function registerVaultTools(registry: ToolRegistry, vault: VaultReader): void {
  registry.register({
    name: "search_vault",
    description: "Search Markdown notes in the user's Vault for relevant paragraphs.",
    input: searchInput,
    output: outputSchema,
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
    run: async ({ query, limit }, context) => searchVault(vault, query, limit ?? 5, context.signal),
  })

  registry.register({
    name: "read_note",
    description: "Read a Markdown note or one named heading from the user's Vault.",
    input: readInput,
    output: outputSchema,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          pattern:
            "^(?!/)(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+\\.[mM][dD]$",
        },
        heading: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["path"],
      additionalProperties: false,
    },
    capability: "read_note",
    approval: "never",
    timeoutMs: 10_000,
    resultBudgetTokens: 1_400,
    provenance: (output) => output.references,
    run: async ({ path, heading }, context) => {
      context.signal.throwIfAborted()
      const content = await vault.readNote(path)
      context.signal.throwIfAborted()
      if (content === null) {
        return {
          references: [],
          omitted: [],
          error: { code: "not_found" as const, message: `${path} was not found.` },
        }
      }
      const selected = excerptForHeading(content, heading)
      const references: VaultEvidenceReference[] = selected.excerpt
        ? [
            {
              kind: "vault",
              path,
              ...(selected.heading ? { heading: selected.heading } : {}),
              excerpt: selected.excerpt,
            },
          ]
        : []
      return { references, omitted: selected.omitted }
    },
  })
}
