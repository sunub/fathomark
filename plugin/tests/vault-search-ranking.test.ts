import { describe, expect, it } from "vitest"

import { searchVault, type VaultReader } from "../src/tools/vault-search"

function vaultOf(notes: Record<string, string>): VaultReader {
  return {
    listNotes: () => Object.keys(notes).map((path) => ({ path, title: path.replace(/\.md$/, "") })),
    readNote: async (path) => notes[path] ?? null,
  }
}

const signal = new AbortController().signal

describe("searchVault IDF weighting", () => {
  it("ranks a note matching a rare word above notes matching only a common word", async () => {
    // "경험" is in every note, "캐시" in one. The rare-word note sorts last by path,
    // so only the weighting can put it first.
    const vault = vaultOf({
      "a.md": "경험 하나",
      "b.md": "경험 둘",
      "c.md": "경험 셋",
      "z.md": "캐시 도입",
    })
    const { references } = await searchVault(vault, "경험 캐시", 4, signal)
    expect(references[0]?.path).toBe("z.md")
  })
})

describe("searchVault note kind", () => {
  it("ranks an experience note above an opinion note that repeats the question's words", async () => {
    // Mirrors the S1 fixtures: the opinion note names the topic in its title and
    // lists the question's words, but describes no experience.
    const vault = vaultOf({
      "의견/성능-최적화에-대한-생각.md": [
        "---",
        "type: opinion",
        "---",
        "# 성능 최적화에 대한 생각",
        "",
        "성능, 지연, 개선 같은 단어가 자주 나오지만 구체적인 경험은 아니고 의견이다.",
      ].join("\n"),
      "경험/상품조회-캐시-도입.md": [
        "---",
        "type: experience",
        "---",
        "# 상품 조회 API 캐시 도입",
        "",
        "성능 개선: p95 지연이 800ms에서 320ms로 줄었다.",
      ].join("\n"),
    })
    const { references } = await searchVault(vault, "성능 지연 개선 경험", 2, signal)
    expect(references.map((item) => item.path)).toEqual([
      "경험/상품조회-캐시-도입.md",
      "의견/성능-최적화에-대한-생각.md",
    ])
  })
})

describe("searchVault experience rule", () => {
  it("ranks notes in a configured folder first, without any frontmatter", async () => {
    // Both notes match equally; only the folder rule can tell the cover letter apart.
    const vault = vaultOf({
      "기타/메모.md": "캐시 도입 이야기",
      "자기소개서/2024.md": "캐시 도입 이야기",
    })
    const { references } = await searchVault(vault, "캐시 도입", 2, signal, { folder: "자기소개서" })
    expect(references[0]?.path).toBe("자기소개서/2024.md")
  })

  it("leaves the order alone when no note meets the rule", async () => {
    const vault = vaultOf({ "a.md": "캐시 도입", "b.md": "캐시 도입" })
    const { references } = await searchVault(vault, "캐시 도입", 2, signal, { folder: "자기소개서" })
    expect(references.map((item) => item.path)).toEqual(["a.md", "b.md"])
  })
})

describe("searchVault heading weight", () => {
  it("ranks a note whose heading names the topic above one that only mentions it", async () => {
    // Same words in both bodies; only z.md puts them in a heading, and it sorts last by path.
    const vault = vaultOf({
      "a.md": "캐시 도입 기록",
      "z.md": "# 캐시 도입\n\n다른 내용",
    })
    const { references } = await searchVault(vault, "캐시 도입", 2, signal)
    expect(references[0]?.path).toBe("z.md")
  })
})

describe("searchVault Korean particles", () => {
  it("matches a word carrying a one-syllable particle to the bare word in a note", async () => {
    const vault = vaultOf({ "a.md": "성능 개선 기록" })
    const { references } = await searchVault(vault, "성능을", 5, signal)
    expect(references.map((item) => item.path)).toEqual(["a.md"])
  })

  it("matches a word carrying a two-syllable particle", async () => {
    const vault = vaultOf({ "a.md": "프로젝트 회고" })
    const { references } = await searchVault(vault, "프로젝트에서", 5, signal)
    expect(references.map((item) => item.path)).toEqual(["a.md"])
  })

  it("keeps a short word whole when stripping would leave one syllable", async () => {
    // "아이" must not become "아", which would match "아침".
    const vault = vaultOf({ "a.md": "아침 일찍 일어났다", "b.md": "아이와 놀았다" })
    const { references } = await searchVault(vault, "아이", 5, signal)
    expect(references.map((item) => item.path)).toEqual(["b.md"])
  })

  it("leaves words that do not end in a particle untouched", async () => {
    const vault = vaultOf({ "a.md": "서비스 운영", "b.md": "서비 이야기" })
    const { references } = await searchVault(vault, "서비스", 5, signal)
    expect(references.map((item) => item.path)).toEqual(["a.md"])
  })
})

describe("searchVault verb endings", () => {
  it("matches a 하다-verb form to its noun stem in a note", async () => {
    const vault = vaultOf({ "a.md": "도입 사례", "b.md": "다른 내용" })
    for (const question of ["도입한", "도입하는", "도입해"]) {
      const { references } = await searchVault(vault, question, 5, signal)
      expect(references.map((item) => item.path), question).toEqual(["a.md"])
    }
  })

  it("keeps a short word whole when stripping would leave one syllable", async () => {
    // "위한" must not become "위", which would match "위치".
    const vault = vaultOf({ "a.md": "위치 정보", "b.md": "위한 노력" })
    const { references } = await searchVault(vault, "위한", 5, signal)
    expect(references.map((item) => item.path)).toEqual(["b.md"])
  })
})

describe("searchVault question frame words", () => {
  it("does not count 경험, 설명, 주세요 against the question's coverage", async () => {
    // Without dropping the frame, 2 of 5 words match (0.4) and the question reads as unsupported.
    const vault = vaultOf({ "a.md": "캐시 도입 사례", "b.md": "다른 내용" })
    const result = await searchVault(vault, "캐시 도입 설명해 주세요 경험", 5, signal)
    expect(result.references.map((item) => item.path)).toEqual(["a.md"])
    expect(result.supported).toBe(true)
  })

  it("drops frame words that carry sentence punctuation", async () => {
    // "주세요." and "있나요?" must reach the frame list as "주세요" and "있나요", not as words
    // that a note's own closing sentence can match.
    const vault = vaultOf({ "a.md": "캐시 도입 사례", "b.md": "다른 내용입니다. 설명해 주세요." })
    const period = await searchVault(vault, "캐시 설명해 주세요.", 5, signal)
    expect(period.references.map((item) => item.path)).toEqual(["a.md"])
    const question = await searchVault(vault, "캐시 도입한 경험이 있나요?", 5, signal)
    expect(question.references.map((item) => item.path)).toEqual(["a.md"])
  })

  it("strips punctuation before particles, so a quoted or comma-ended word still matches", async () => {
    const vault = vaultOf({ "a.md": "성능 개선 사례 도입" })
    const result = await searchVault(vault, "성능을, 개선을, 사례를, 도입", 5, signal)
    expect(result.references.map((item) => item.path)).toEqual(["a.md"])
    expect(result.supported).toBe(true)
  })

  it("keeps symbols that are part of a word", async () => {
    const vault = vaultOf({ "a.md": "C++ 와 Node.js 사용" })
    const { references } = await searchVault(vault, "Node.js 사용했나요?", 5, signal)
    expect(references.map((item) => item.path)).toEqual(["a.md"])
  })

  it("keeps the words when the question is nothing but frame", async () => {
    const vault = vaultOf({ "a.md": "경험 정리", "b.md": "다른 내용" })
    const { references } = await searchVault(vault, "경험", 5, signal)
    expect(references.map((item) => item.path)).toEqual(["a.md"])
  })
})

describe("searchVault supported", () => {
  // Every word below is in one of two notes, so each query word carries the same weight.
  const vault = vaultOf({ "a.md": "알파 베타 감마", "b.md": "다른 내용" })

  it("is supported when the best note covers most of the question", async () => {
    const result = await searchVault(vault, "알파 베타 감마 델타", 5, signal)
    expect(result.supported).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("is supported at exactly half coverage", async () => {
    const result = await searchVault(vault, "알파 베타 델타 엡실론", 5, signal)
    expect(result.supported).toBe(true)
  })

  it("reports below_threshold but still returns the closest notes when coverage is under half", async () => {
    const result = await searchVault(vault, "알파 베타 델타 엡실론 제타", 5, signal)
    expect(result.supported).toBe(false)
    expect(result.reason).toBe("below_threshold")
    expect(result.references.map((item) => item.path)).toEqual(["a.md"])
  })

  it("reports no_match when no note qualifies", async () => {
    const result = await searchVault(vault, "델타 엡실론", 5, signal)
    expect(result).toMatchObject({ supported: false, reason: "no_match", references: [] })
  })
})

describe("searchVault minimum should match", () => {
  it("drops notes that match only a common word when the question has four words", async () => {
    const vault = vaultOf({
      "common-only.md": "경험을 적었다",
      "both.md": "캐시를 도입한 기록",
      "other.md": "경험 메모",
    })
    const { references } = await searchVault(vault, "경험 서비스 캐시 도입", 10, signal)
    expect(references.map((item) => item.path)).toEqual(["both.md"])
  })

  it("needs one matching word for a one- or two-word question", async () => {
    const vault = vaultOf({ "a.md": "캐시 도입" })
    const { references } = await searchVault(vault, "캐시 없는단어", 10, signal)
    expect(references.map((item) => item.path)).toEqual(["a.md"])
  })
})
