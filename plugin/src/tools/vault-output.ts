import { z } from "zod"

import type { VaultEvidenceReference } from "../context/evidence"

/** What `search_vault` and `read_note` share: the passages found, what was left out, and a missing target. */
export interface VaultToolOutput {
  readonly references: VaultEvidenceReference[]
  readonly omitted: string[]
  readonly error?: { readonly code: "not_found"; readonly message: string }
}

export const vaultOutputShape = {
  references: z.array(
    z.object({
      kind: z.literal("vault"),
      path: z.string(),
      heading: z.string().optional(),
      excerpt: z.string(),
    })
  ),
  omitted: z.array(z.string()),
  error: z.object({ code: z.literal("not_found"), message: z.string() }).optional(),
}

export const vaultOutputSchema = z.object(vaultOutputShape) as unknown as z.ZodType<VaultToolOutput>
