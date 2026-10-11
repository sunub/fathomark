import { describe, expect, it } from "vitest"

import { meaningPasses, verifyMeaning, type MeaningInput, type StructuredCall } from "../src/workflow/meaning"

const input: MeaningInput = {
  draft: { claims: [{ text: "캐시를 도입했습니다.", evidence: ["S1"] }] },
  evidence: [{ sourceId: "S1", reference: { kind: "vault", path: "a.md", excerpt: "캐시를 도입했다." } }],
  requiredFacts: [],
  original: null,
  style: null,
}
const clean = { checks: [{ claim: "캐시를 도입했습니다.", facts: [], evidence: "캐시를 도입했다.", differences: [], sameMeaning: true }], originalFacts: [], requiredFacts: [], needsNewFacts: false, supported: true }

function reviewer(review: unknown): StructuredCall {
  return async (_task, _data, schema) => schema.parse(review)
}

describe("meaning review", () => {
  it("passes when every itemised check holds", async () => {
    const verdict = await verifyMeaning(reviewer(clean), input)
    expect(verdict).toEqual({ issues: [], needsNewFacts: false, supported: true })
    expect(meaningPasses(verdict)).toBe(true)
  })

  it("blocks a mismatched claim even when the model's own verdict says supported", async () => {
    const verdict = await verifyMeaning(reviewer({ ...clean, checks: [{ ...clean.checks[0], differences: ["역할이 과장됨"], sameMeaning: false }] }), input)
    expect(meaningPasses(verdict)).toBe(false)
    expect(verdict.issues).toEqual(["캐시를 도입했습니다.: 역할이 과장됨"])
  })

  it("names a mismatch the model did not explain", async () => {
    const verdict = await verifyMeaning(reviewer({ ...clean, checks: [{ ...clean.checks[0], sameMeaning: false }] }), input)
    expect(verdict.issues).toEqual(["캐시를 도입했습니다.: 근거와 의미가 다릅니다."])
  })

  it("ignores remarks written into a check the model judged to hold", async () => {
    const verdict = await verifyMeaning(reviewer({ ...clean, checks: [{ ...clean.checks[0], differences: ["n/a"] }] }), input)
    expect(meaningPasses(verdict)).toBe(true)
  })

  it("blocks dropped original facts and missing required facts", async () => {
    const verdict = await verifyMeaning(reviewer({ ...clean, originalFacts: [{ fact: "DB 부하 40% 감소", kept: false }], requiredFacts: [{ fact: "서킷 브레이커", kept: false }] }), input)
    expect(verdict.issues).toEqual(["원문 사실 누락: DB 부하 40% 감소", "필수 사실 누락: 서킷 브레이커"])
    expect(meaningPasses(verdict)).toBe(false)
  })

  it("keeps a supported=false verdict blocking without itemised reasons", async () => {
    expect(meaningPasses(await verifyMeaning(reviewer({ ...clean, supported: false }), input))).toBe(false)
  })

  it("passes needsNewFacts through so the workflow skips a futile repair", async () => {
    expect((await verifyMeaning(reviewer({ ...clean, needsNewFacts: true }), input)).needsNewFacts).toBe(true)
  })
})
