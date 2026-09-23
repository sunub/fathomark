import { describe, expect, it } from "vitest"

import { CallLimiter, decide, isAllowedTool } from "../src/harness/policy"

describe("permission table", () => {
  it("allows vault reads without asking", () => {
    for (const capability of ["read_current_note", "search_vault", "read_note"] as const) {
      expect(decide(capability, { networkResearchEnabled: false })).toEqual({
        allowed: true,
        requiresApproval: false,
      })
    }
  })

  it("keeps Wikipedia off until the user turns it on", () => {
    expect(decide("wikipedia", { networkResearchEnabled: false }).allowed).toBe(false)
    expect(decide("wikipedia", { networkResearchEnabled: true }).allowed).toBe(true)
  })

  it("requires approval before anything is written to a note", () => {
    expect(decide("insert_into_current_note", { networkResearchEnabled: true })).toMatchObject({
      allowed: true,
      requiresApproval: true,
    })
  })

  it("refuses the deferred capabilities no matter what settings say", () => {
    const on = { networkResearchEnabled: true }
    for (const capability of [
      "modify_multiple_notes",
      "external_model",
      "general_web",
      "vault_text_egress",
    ] as const) {
      expect(decide(capability, on).allowed).toBe(false)
    }
  })
})

describe("tool allowlist", () => {
  it("rejects a tool name the model invented", () => {
    expect(isAllowedTool("search_vault", ["search_vault", "read_note"])).toBe(true)
    expect(isAllowedTool("delete_vault", ["search_vault", "read_note"])).toBe(false)
  })
})

describe("call limiter", () => {
  it("stops a model that keeps calling the same tool", () => {
    const limiter = new CallLimiter(2, 10)
    expect(limiter.check("search_vault")).toBeNull()
    expect(limiter.check("search_vault")).toBeNull()
    expect(limiter.check("search_vault")).toMatch(/already called/)
  })

  it("stops a run that spreads too many calls across tools", () => {
    const limiter = new CallLimiter(10, 3)
    expect(limiter.check("a")).toBeNull()
    expect(limiter.check("b")).toBeNull()
    expect(limiter.check("c")).toBeNull()
    expect(limiter.check("d")).toMatch(/limit of 3/)
  })
})
