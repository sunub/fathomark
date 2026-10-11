import { describe, expect, it } from "vitest"

import { completeWithoutTools } from "../src/harness/completion"

const vault = { sourceId: "S1", reference: { kind: "vault", path: "a.md", excerpt: "x" } } as const
const external = {
  sourceId: "S2",
  reference: { kind: "external", source: "wikipedia", title: "t", url: "u", excerpt: "x" },
} as never

describe("completeWithoutTools", () => {
  it("completes a chat reply regardless of evidence", () => {
    expect(completeWithoutTools("chat", "stop", [])).toEqual({ outcome: "complete", reason: "stop" })
  })

  it("never completes a truncated reply", () => {
    expect(completeWithoutTools("career", "length", [vault]).outcome).toBe("incomplete")
    expect(completeWithoutTools("chat", "length", []).outcome).toBe("incomplete")
  })

  it("proposes exploration is ready in career mode only with the user's own notes cited", () => {
    expect(completeWithoutTools("career", "stop", [vault])).toEqual({
      outcome: "complete",
      reason: "exploration_ready",
    })
  })

  it("keeps a career run incomplete when only public sources or nothing was cited", () => {
    expect(completeWithoutTools("career", "stop", [])).toEqual({
      outcome: "incomplete",
      reason: "evidence_insufficient",
    })
    expect(completeWithoutTools("career", "stop", [external]).reason).toBe("evidence_insufficient")
  })
})
