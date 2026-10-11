import { z } from "zod"

import { checkStyleCopy } from "./copy-check"
import type { CitedEvidence } from "./evidence"

export const draftSchema = z.object({
  claims: z.array(z.object({
    text: z.string().trim().min(1).max(2000).refine((text) => !/\[\[S\d+\]\]/.test(text), "Citations are assembled by code"),
    evidence: z.array(z.string().regex(/^S[1-9]\d*$/)).max(10),
  }).strict()).min(1).max(30),
}).strict()

export type CareerDraft = z.infer<typeof draftSchema>

export interface ClaimVerification {
  readonly passed: boolean
  readonly issues: readonly string[]
  readonly text: string
}

function numbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*(?:\s?(?:%|퍼센트|ms|초|명|인|개|배|원|년|월|일))?/g) ?? [])
    .map((value) => value.replace(/\s/g, "").replace(/퍼센트$/, "%").replace(/인$/, "명"))
}

/** The year and month an ISO-style date such as 2024-03 states, in the 2024년 and 3월 forms a draft uses. */
function datedValues(text: string): string[] {
  return [...text.matchAll(/(?<!\d)(\d{4})[-./](\d{1,2})(?!\d)/g)].flatMap((match) => [`${match[1]}년`, `${Number(match[2])}월`])
}

/** Literal checks only; the workflow must also verify role/outcome meaning. */
export function verifyClaims(
  draft: CareerDraft,
  evidence: readonly CitedEvidence[],
  styleText = "",
): ClaimVerification {
  const byId = new Map(evidence.map((item) => [item.sourceId, item.reference]))
  const issues: string[] = []
  const paragraphs: string[] = []

  for (const [index, claim] of draft.claims.entries()) {
    const label = `claim ${index + 1}`
    if (!claim.evidence.length) issues.push(`${label}: unsupported`)
    const excerpts: string[] = []
    for (const sourceId of new Set(claim.evidence)) {
      const source = byId.get(sourceId)
      if (!source) {
        issues.push(`${label}: invalid_citation ${sourceId}`)
      } else if (source.kind !== "vault" && source.kind !== "user") {
        issues.push(`${label}: personal_evidence_required ${sourceId}`)
      } else {
        excerpts.push(source.excerpt)
      }
    }
    const citedText = excerpts.join("\n")
    const supportedNumbers = new Set([...numbers(citedText), ...datedValues(citedText)])
    for (const value of numbers(claim.text)) {
      if (!supportedNumbers.has(value)) issues.push(`${label}: literal_mismatch ${value}`)
    }
    // Explicitly quoted facts must be present verbatim in the cited excerpts.
    for (const match of claim.text.matchAll(/["“]([^"”]+)["”]/g)) {
      if (match[1] && !citedText.includes(match[1])) issues.push(`${label}: quoted_fact_mismatch ${match[1]}`)
    }
    issues.push(...checkStyleCopy(claim.text, styleText, citedText).map((issue) => `${label}: ${issue}`))
    paragraphs.push(`${claim.text} ${[...new Set(claim.evidence)].map((id) => `[[${id}]]`).join(" ")}`)
  }

  return { passed: issues.length === 0, issues, text: issues.length ? "" : paragraphs.join("\n\n") }
}
