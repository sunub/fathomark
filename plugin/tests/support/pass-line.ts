/*
 * The four S2 pass-line metrics (docs/superpowers/plans/2026-10-05-career-s2-retrieval-ranking.md,
 * "합격선"). Pure functions over per-question results, so any retriever can be judged.
 *
 * `expected` lists notes that each describe the experience on their own (a real vault holds
 * the same story in a cover letter, a resume and a portfolio), so one of them in the top 3
 * counts as a hit. This differs from `recallAtK`, which averages over every expected note.
 */

export type NoteKind = "experience" | "study" | "prep" | "other"

export interface JudgedCase {
  readonly shouldAbstain: boolean
  readonly expected: readonly string[]
  readonly ranked: readonly string[]
  readonly supported: boolean
  /** Vault-relative path -> kind. Notes missing from the map count as not experience. */
  readonly kindOf: (path: string) => NoteKind
}

export interface PassLine {
  /** Share of answerable questions with an expected note in the top 3. Pass: >= 0.75. */
  readonly recall3: number
  /** Share of no-evidence questions reported `supported: false`. Pass: >= 0.90. */
  readonly blocked: number
  /** Share of answerable questions reported `supported: false`. Pass: <= 0.20. */
  readonly wronglyBlocked: number
  /** Share of answerable questions with results whose top note is not an experience note. Pass: <= 0.10. */
  readonly nonExperienceFirst: number
  readonly answerable: number
  readonly noEvidence: number
  readonly pass: boolean
}

export const PASS_LINE = { recall3: 0.75, blocked: 0.9, wronglyBlocked: 0.2, nonExperienceFirst: 0.1 } as const

export function judge(cases: readonly JudgedCase[]): PassLine {
  const answerable = cases.filter((item) => !item.shouldAbstain)
  const noEvidence = cases.filter((item) => item.shouldAbstain)
  const share = (items: readonly JudgedCase[], test: (item: JudgedCase) => boolean) =>
    items.length === 0 ? 0 : items.filter(test).length / items.length

  const recall3 = share(answerable, (item) => item.ranked.slice(0, 3).some((path) => item.expected.includes(path)))
  const blocked = noEvidence.length === 0 ? 1 : share(noEvidence, (item) => !item.supported)
  const wronglyBlocked = share(answerable, (item) => !item.supported)
  const withResults = answerable.filter((item) => item.ranked.length > 0)
  const nonExperienceFirst = share(withResults, (item) => item.kindOf(item.ranked[0] as string) !== "experience")

  return {
    recall3,
    blocked,
    wronglyBlocked,
    nonExperienceFirst,
    answerable: answerable.length,
    noEvidence: noEvidence.length,
    pass:
      recall3 >= PASS_LINE.recall3 &&
      blocked >= PASS_LINE.blocked &&
      wronglyBlocked <= PASS_LINE.wronglyBlocked &&
      nonExperienceFirst <= PASS_LINE.nonExperienceFirst,
  }
}
