import { z } from "zod"

import type { VaultEvidenceReference } from "../context/evidence"
import type { ToolRegistry } from "./registry"
import { type VaultReader, excerptForHeading } from "./vault-search"
import { vaultOutputSchema } from "./vault-output"

const safeMarkdownPath = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path), "Absolute paths are not allowed.")
  .refine((path) => !path.replace(/\\/g, "/").split("/").includes(".."), "Parent traversal is not allowed.")
  .refine((path) => path.toLocaleLowerCase().endsWith(".md"), "Only Markdown notes can be read.")

const readInput = z.object({ path: safeMarkdownPath, heading: z.string().trim().min(1).max(200).optional() }).strict()

export function registerReadNote(registry: ToolRegistry, vault: VaultReader): void {
  registry.register({
    name: "read_note",
    description: "Read a Markdown note or one named heading from the user's Vault.",
    input: readInput,
    output: vaultOutputSchema,
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
