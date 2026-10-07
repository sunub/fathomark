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
