import { describe, expect, it } from "vitest"

import type { CitedEvidence } from "../src/context/evidence"
import { judgeReadiness, type ReadinessReview } from "../src/workflow/readiness"

const sources: CitedEvidence[] = [
  { sourceId: "S1", reference: { kind: "vault", path: "search.md", excerpt: "2024-05, 사내 문서 검색의 상위 5개 적중률을 61%에서 78%로 높였다." } },
  { sourceId: "S2", reference: { kind: "user", runId: "r", questionId: "q", answerId: "a", excerpt: "주간 회의를 진행하고 일정을 조율했습니다." } },
]
const review = (facts: ReadinessReview["facts"], extra: Partial<ReadinessReview> = {}): ReadinessReview => ({ facts, conflicts: [], ready: true, ...extra })

describe("readiness judgement", () => {
  it("is ready when every item quotes a sentence its source actually contains", () => {
    expect(judgeReadiness(review([
      { fact: "검색 품질 개선", sourceId: "S1", quote: "상위 5개 적중률을 61%에서 78%로 높였다" },
      { fact: "본인 역할", sourceId: "S2", quote: "주간 회의를 진행하고 일정을 조율했습니다." },
    ]), sources)).toEqual({ ready: true, sourceIds: ["S1", "S2"], missing: [], conflicts: [] })
  })

  it("tolerates spacing and punctuation differences in a quote", () => {
    expect(judgeReadiness(review([{ fact: "검색", sourceId: "S1", quote: "상위 5개 적중률을 61% 에서 78% 로 높였다." }]), sources).ready).toBe(true)
  })

  it("treats a quote the source does not contain as missing, even when the model says ready", () => {
    expect(judgeReadiness(review([{ fact: "머신러닝 모델 배포", sourceId: "S1", quote: "머신러닝 모델을 서비스에 배포했다" }]), sources))
      .toEqual({ ready: false, sourceIds: [], missing: ["머신러닝 모델 배포"], conflicts: [] })
  })

  it("treats an empty quote, an unknown source or a public source as missing", () => {
    const withPublic: CitedEvidence[] = [...sources, { sourceId: "S3", reference: { kind: "public", sourceId: "P1", title: "공고", collectedAt: "2026-10-11", excerpt: "MSA 전환 경험자 우대" } }]
    const result = judgeReadiness(review([
      { fact: "A", sourceId: "", quote: "" },
      { fact: "B", sourceId: "S9", quote: "상위 5개" },
      { fact: "C", sourceId: "S3", quote: "MSA 전환 경험자 우대" },
    ]), withPublic)
    expect(result).toMatchObject({ ready: false, sourceIds: [], missing: ["A", "B", "C"] })
  })

  it("is not ready with conflicts, without items, or when the model itself says not ready", () => {
    const quoted = [{ fact: "검색", sourceId: "S1", quote: "적중률을 61%에서 78%로 높였다" }]
    expect(judgeReadiness(review(quoted, { conflicts: ["역할 충돌"] }), sources)).toMatchObject({ ready: false, conflicts: ["역할 충돌"] })
    expect(judgeReadiness(review([]), sources).ready).toBe(false)
    expect(judgeReadiness(review(quoted, { ready: false }), sources).ready).toBe(false)
  })
})
