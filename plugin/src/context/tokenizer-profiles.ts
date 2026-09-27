import type { ModelRequest, RequestCounter } from "../providers/types"

export interface BudgetProfile {
  readonly modelDigest: string
  readonly templateSha256: string
  readonly tokenizerFamily: "byte_bpe"
  readonly contentExpansionBound: number
  readonly perMessageTokens: number
  readonly perToolTokens: number
  readonly fixedTokens: number
  readonly evidencePath: string
}

export const VERIFIED_BUDGET_PROFILES: readonly BudgetProfile[] = []

export function createVerifiedCounter(profile: BudgetProfile): RequestCounter {
  validateProfile(profile)
  return {
    async count(request: ModelRequest) {
      const serializedBytes = new TextEncoder().encode(JSON.stringify(request)).length
      return {
        promptTokens:
          serializedBytes * profile.contentExpansionBound +
          request.messages.length * profile.perMessageTokens +
          request.tools.length * profile.perToolTokens +
          profile.fixedTokens,
        method: "verified_upper_bound" as const,
      }
    },
  }
}

function validateProfile(profile: BudgetProfile): void {
  if (!profile.modelDigest.trim() || !profile.templateSha256.trim() || !profile.evidencePath.trim()) {
    throw new Error("A verified budget profile requires digest, template, and evidence identifiers.")
  }
  for (const [name, value] of Object.entries({
    contentExpansionBound: profile.contentExpansionBound,
    perMessageTokens: profile.perMessageTokens,
    perToolTokens: profile.perToolTokens,
    fixedTokens: profile.fixedTokens,
  })) {
    if (!Number.isInteger(value) || value < 0 || (name === "contentExpansionBound" && value === 0)) {
      throw new Error(`${name} must be a valid non-negative integer bound.`)
    }
  }
}
