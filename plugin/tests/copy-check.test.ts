import { describe, expect, it } from "vitest"

import { checkStyleCopy } from "../src/context/copy-check"

describe("style copy checks", () => {
  it("detects style-only numbers, URLs and names", () => {
    const style = "Acme에서 32% 개선했습니다. https://acme.example/results"
    expect(checkStyleCopy(style, style, "테스트를 작성했습니다.")).toEqual(expect.arrayContaining([
      "style_literal: Acme", "style_literal: 32%", "style_literal: https://acme.example/results",
    ]))
  })
  it("allows style facts independently supported by evidence", () => {
    const text = "Acme에서 32% 개선했습니다."
    expect(checkStyleCopy(text, text, text)).toEqual([])
  })
  it("detects long copied phrases even without numeric facts", () => {
    const style = "문제를 발견한 뒤 팀과 함께 원인을 분석하고 개선 방향을 논의한 다음 작은 실험으로 가능성을 확인했습니다."
    expect(checkStyleCopy(style, style, "테스트 작성 지원").length).toBeGreaterThan(0)
    expect(checkStyleCopy(style, style, style)).toEqual([])
  })
  it("allows short generic style overlap", () => {
    expect(checkStyleCopy("팀과 협업했습니다.", "팀과 협업했습니다.", "")).toEqual([])
  })
})
