import { describe, expect, it } from "vitest"

import { DEFAULT_EXPERIENCE_RULE, experienceRuleFor, isExperienceNote } from "../src/tools/note-kind"

const note = (frontmatter: string[]): string => ["---", ...frontmatter, "---", "# 제목", "본문"].join("\n")

describe("isExperienceNote with the default rule (frontmatter type)", () => {
  it("accepts type: experience", () => {
    expect(isExperienceNote("a.md", note(["type: experience"]))).toBe(true)
  })

  it("accepts a quoted value", () => {
    expect(isExperienceNote("a.md", note(['type: "experience"']))).toBe(true)
  })

  it("rejects other types and notes without frontmatter", () => {
    expect(isExperienceNote("a.md", note(["type: opinion"]))).toBe(false)
    expect(isExperienceNote("a.md", "# 제목\n본문")).toBe(false)
  })

  it("ignores a type line outside the leading frontmatter block", () => {
    expect(isExperienceNote("a.md", "# 제목\ntype: experience")).toBe(false)
    expect(isExperienceNote("a.md", `# 제목\n---\ntype: experience\n---`)).toBe(false)
  })
})

describe("isExperienceNote with a tag rule", () => {
  const rule = { tag: "경력" }

  it("reads an inline list", () => {
    expect(isExperienceNote("a.md", note(["tags: [경력, 프로젝트]"]), rule)).toBe(true)
  })

  it("reads a block list", () => {
    expect(isExperienceNote("a.md", note(["tags:", "  - 프로젝트", "  - 경력"]), rule)).toBe(true)
  })

  it("accepts a leading # on the tag", () => {
    expect(isExperienceNote("a.md", note(["tags: [경력]"]), { tag: "#경력" })).toBe(true)
  })

  it("rejects a note without the tag", () => {
    expect(isExperienceNote("a.md", note(["tags: [독서]"]), rule)).toBe(false)
  })

  it("does not fall back to the default type rule", () => {
    expect(isExperienceNote("a.md", note(["type: experience"]), rule)).toBe(false)
  })
})

describe("isExperienceNote with several folders", () => {
  const rule = { folder: "경험, resume/이력서/ ,," }

  it("matches a note in any listed folder", () => {
    expect(isExperienceNote("경험/a.md", "", rule)).toBe(true)
    expect(isExperienceNote("resume/이력서/b.md", "", rule)).toBe(true)
  })

  it("ignores blank entries and unlisted folders", () => {
    expect(isExperienceNote("resume/c.md", "", rule)).toBe(false)
    expect(isExperienceNote("x.md", "", rule)).toBe(false)
  })
})

describe("isExperienceNote with a folder rule", () => {
  const rule = { folder: "경험" }

  it("matches notes inside the folder, including subfolders", () => {
    expect(isExperienceNote("경험/a.md", "본문", rule)).toBe(true)
    expect(isExperienceNote("경험/2024/a.md", "본문", rule)).toBe(true)
  })

  it("does not match a folder that only shares the prefix or is nested elsewhere", () => {
    expect(isExperienceNote("경험담/a.md", "본문", rule)).toBe(false)
    expect(isExperienceNote("기타/경험/a.md", "본문", rule)).toBe(false)
  })

  it("matches a decomposed (NFD) path against a composed rule", () => {
    expect(isExperienceNote("경험/a.md".normalize("NFD"), "본문", rule)).toBe(true)
  })
})

describe("isExperienceNote with several criteria", () => {
  it("accepts a note that meets any one of them", () => {
    const rule = { type: "experience", folder: "경험" }
    expect(isExperienceNote("경험/a.md", "본문", rule)).toBe(true)
    expect(isExperienceNote("기타/a.md", note(["type: experience"]), rule)).toBe(true)
    expect(isExperienceNote("기타/a.md", "본문", rule)).toBe(false)
  })

  it("accepts nothing for an empty rule", () => {
    expect(isExperienceNote("경험/a.md", note(["type: experience"]), {})).toBe(false)
  })
})

describe("experienceRuleFor", () => {
  it("falls back to the default rule for an empty or blank folder", () => {
    expect(experienceRuleFor("")).toEqual(DEFAULT_EXPERIENCE_RULE)
    expect(experienceRuleFor("   ")).toEqual(DEFAULT_EXPERIENCE_RULE)
  })

  it("adds the folder next to the default type, so labelled notes still count", () => {
    const rule = experienceRuleFor(" 자기소개서 ")
    expect(rule).toEqual({ type: "experience", folder: "자기소개서" })
    expect(isExperienceNote("기타/a.md", note(["type: experience"]), rule)).toBe(true)
    expect(isExperienceNote("자기소개서/a.md", "본문", rule)).toBe(true)
  })
})
