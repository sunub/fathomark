import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS, parseSettings } from "../src/settings"

describe("parseSettings experienceFolder", () => {
  it("defaults to no folder", () => {
    expect(DEFAULT_SETTINGS.experienceFolder).toBe("")
    expect(parseSettings({}).experienceFolder).toBe("")
  })

  it("keeps a saved folder", () => {
    expect(parseSettings({ experienceFolder: "자기소개서" }).experienceFolder).toBe("자기소개서")
  })

  it("ignores a value of the wrong type from an older or corrupt file", () => {
    expect(parseSettings({ experienceFolder: 3 }).experienceFolder).toBe("")
  })
})

describe("parseSettings semanticSearch", () => {
  it("is on by default and for a settings file written before the option existed", () => {
    expect(DEFAULT_SETTINGS.semanticSearch).toBe(true)
    expect(parseSettings({}).semanticSearch).toBe(true)
  })

  it("keeps a saved choice and ignores a value of the wrong type", () => {
    expect(parseSettings({ semanticSearch: false }).semanticSearch).toBe(false)
    expect(parseSettings({ semanticSearch: "no" }).semanticSearch).toBe(true)
  })
})
