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

/** Reduce complete paragraph suffixes, never source strings or serialized JSON. */
export function boundVaultOutput<T extends VaultToolOutput>(
  output: T,
  countResultTokens?: (content: string) => number,
  budget = 1_400,
): T {
  if (!countResultTokens || countResultTokens(JSON.stringify(output)) <= budget) return output

  const references = output.references.map((reference) => ({ ...reference }))
  const endings = references.map(({ excerpt }) => {
    const ends: number[] = []
    let start = 0
    for (const separator of excerpt.matchAll(/(?:\r\n|\n|\r(?!\n))[ \t]*(?:\r\n|\n|\r(?!\n))/g)) {
      if (excerpt.slice(start, separator.index).trim()) ends.push(separator.index)
      start = separator.index + separator[0].length
    }
    if (excerpt.slice(start).trim()) ends.push(excerpt.length)
    return ends
  })
  let omittedParagraphs = 0
  const affected = new Set<number>()
  const result = (): T => ({
    ...output,
    references,
    omitted: [...output.omitted, `Vault result budget omitted ${omittedParagraphs} paragraphs from ${affected.size} references.`],
  })

  while (countResultTokens(JSON.stringify(result())) > budget && references.length) {
    const index = references.length - 1
    const ends = endings[index]!
    affected.add(index)
    if (ends.length) {
      ends.pop()
      omittedParagraphs++
    }
    if (!ends.length) {
      references.pop()
    } else {
      references[index] = { ...references[index]!, excerpt: output.references[index]!.excerpt.slice(0, ends[ends.length - 1]) }
    }
  }
  const bounded = result()
  if (countResultTokens(JSON.stringify(bounded)) > budget) {
    throw new Error("Vault result metadata exceeds the result budget even without evidence.")
  }
  return bounded
}
