import { describe, expect, it } from "vitest"

import { decide } from "../src/harness/policy"
import { registerProposeRevisionTool } from "../src/tools/propose-revision"
import { ToolRegistry } from "../src/tools/registry"
import type { ToolExecutionContext } from "../src/tools/registry"

const context: ToolExecutionContext = {
  signal: new AbortController().signal,
  researchTopic: null,
  allowedWikipediaPages: new Set(),
  permissions: () => ({ networkResearchEnabled: false }),
  onResearchQuery: () => {},
}

const registry = new ToolRegistry()
registerProposeRevisionTool(registry)
const tool = registry.get("propose_revision")!

const ORIGINAL =
  "I led the cache migration for three months, cutting latency by 30% across 12 services [[S1]]. It was a lot of work."

async function propose(revised: string, keepFacts: string[] = []) {
  const output = await tool.run(
    { original: ORIGINAL, revised, criteria: "shorter", keepFacts } as never,
    context
  )
  expect(tool.output.safeParse(output).success).toBe(true)
  return output as { status: string; issues: { code: string; severity: string }[] }
}

describe("propose_revision", () => {
  it("accepts a shorter rewrite that keeps every number and citation", async () => {
    const result = await propose(
      "I led the three-month cache migration, cutting latency by 30% across 12 services [[S1]].",
      ["I led"]
    )
    expect(result.status).toBe("ready")
    expect(result.issues.map((issue) => issue.code)).toEqual([])
  })

  it("rejects a number that was not in the original", async () => {
    const result = await propose("I led the cache migration, cutting latency by 35% across 12 services [[S1]].")
    expect(result.status).toBe("rejected")
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "added_number", severity: "blocking" }))
  })

  it("rejects a citation the original did not carry", async () => {
    const result = await propose("I led the cache migration, cutting latency by 30% across 12 services [[S2]].")
    expect(result.status).toBe("rejected")
    expect(result.issues.map((issue) => issue.code)).toContain("added_citation")
  })

  it("rejects a rewrite that drops a fact the user said to keep", async () => {
    const result = await propose("The team cut latency by 30% across 12 services [[S1]].", ["I led"])
    expect(result.status).toBe("rejected")
    expect(result.issues.map((issue) => issue.code)).toContain("missing_keep_fact")
  })

  it("flags a dropped number or citation for review without rejecting", async () => {
    const result = await propose("I led the cache migration, cutting latency by 30%.")
    expect(result.status).toBe("ready")
    expect(result.issues).toEqual([
      { severity: "review", code: "dropped_number", detail: "12 was in the original." },
      { severity: "review", code: "dropped_citation", detail: "[[S1]] was cited in the original." },
    ])
  })

  it("reports no change for text that differs only in whitespace", async () => {
    expect((await propose(ORIGINAL.replace(/ /g, "  "))).status).toBe("no_change")
  })

  it("rejects input outside the schema and cannot write or cite", () => {
    expect(tool.input.safeParse({ original: "a", revised: "b" }).success).toBe(false)
    expect(tool.input.safeParse({ original: "a", revised: "b", criteria: "c", path: "x.md" }).success).toBe(false)
    expect(tool.provenance({} as never)).toEqual([])
    expect(decide(tool.capability, { networkResearchEnabled: false })).toEqual({
      allowed: true,
      requiresApproval: false,
    })
  })
})
