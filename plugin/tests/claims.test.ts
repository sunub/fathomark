import { describe, expect, it } from "vitest"

import { draftSchema, verifyClaims } from "../src/context/claims"
import type { CitedEvidence } from "../src/context/evidence"

const evidence: CitedEvidence[] = [{
  sourceId: "S1",
  reference: { kind: "vault", path: "experience.md", excerpt: "테스트 작성을 도왔고 응답 시간을 320ms에서 230ms로 줄였습니다." },
}]
const draft = (text: string, ids = ["S1"]) => ({ claims: [{ text, evidence: ids }] })

describe("career claims", () => {
  it("assembles only cited claims", () => {
    expect(verifyClaims(draft("테스트 작성을 도왔습니다."), evidence)).toEqual({
      passed: true, issues: [], text: "테스트 작성을 도왔습니다. [[S1]]",
    })
  })
  it("rejects missing and nonexistent citations", () => {
    expect(verifyClaims(draft("테스트를 작성했습니다.", []), evidence).passed).toBe(false)
    expect(verifyClaims(draft("테스트를 작성했습니다.", ["S2"]), evidence).passed).toBe(false)
  })
  it("rejects changed numbers and units", () => {
    for (const text of ["응답 시간을 240ms로 줄였습니다.", "응답 시간을 230%로 줄였습니다."]) {
      expect(verifyClaims(draft(text), evidence).passed).toBe(false)
    }
  })
  it("does not require unrelated excerpt numbers in every claim", () => {
    expect(verifyClaims(draft("테스트 작성을 도왔습니다."), evidence).passed).toBe(true)
  })
  it("rejects public evidence for personal experience", () => {
    const publicEvidence: CitedEvidence[] = [{ sourceId: "S1", reference: {
      kind: "external", source: "wikipedia", title: "Test", url: "https://example.com", excerpt: "테스트를 작성했습니다.",
    } }]
    expect(verifyClaims(draft("테스트를 작성했습니다."), publicEvidence).passed).toBe(false)
  })
  it("rejects embedded citations and additional prose outside claims", () => {
    expect(draftSchema.safeParse(draft("경험 [[S99]]")).success).toBe(false)
    expect(draftSchema.safeParse({ ...draft("경험"), text: "검증되지 않은 문장" }).success).toBe(false)
  })
  it("blocks style facts and returns no approvable text on failure", () => {
    const result = verifyClaims(draft("Acme에서 테스트를 작성했습니다."), evidence, "Acme에서 프로젝트를 진행했습니다.")
    expect(result.passed).toBe(false)
    expect(result.text).toBe("")
  })
})

describe("career claim dates and counters", () => {
  const dated = (excerpt: string): CitedEvidence[] => [{ sourceId: "S1", reference: { kind: "vault", path: "a.md", excerpt } }]
  const issues = (excerpt: string, text: string) => verifyClaims(draft(text), dated(excerpt)).issues

  it("accepts a year and month written out from an ISO-style date", () => {
    expect(issues("2024-03, 캐시를 도입했다.", "2024년 3월에 캐시를 도입했습니다.")).toEqual([])
    expect(issues("2024-01부터 6개월간 리드를 맡았다.", "2024년 1월부터 6개월간 리드를 맡았습니다.")).toEqual([])
  })

  it("still rejects a different year, month or a duration hidden in a date", () => {
    expect(issues("2024-03, 캐시를 도입했다.", "2023년에 캐시를 도입했습니다.")).toEqual(["claim 1: literal_mismatch 2023년"])
    expect(issues("2024-03, 캐시를 도입했다.", "2024년 4월에 캐시를 도입했습니다.")).toEqual(["claim 1: literal_mismatch 4월"])
    expect(issues("2024-03, 캐시를 도입했다.", "3년간 캐시를 운영했습니다.")).toEqual(["claim 1: literal_mismatch 3년"])
  })

  it("treats 인 and 명 as the same headcount", () => {
    expect(issues("4명 팀의 리드를 맡았다.", "4인 팀을 이끌었습니다.")).toEqual([])
    expect(issues("4명 팀의 리드를 맡았다.", "5인 팀을 이끌었습니다.")).toEqual(["claim 1: literal_mismatch 5명"])
  })
})
