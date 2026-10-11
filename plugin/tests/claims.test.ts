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
