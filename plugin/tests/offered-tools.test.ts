import { describe, expect, it } from "vitest"
import { z } from "zod"

import { offeredTools } from "../src/harness/agent-loop"
import type { Capability } from "../src/harness/policy"
import { ToolRegistry } from "../src/tools/registry"

function registryWith(tools: Record<string, Capability>): ToolRegistry {
  const registry = new ToolRegistry()
  for (const [name, capability] of Object.entries(tools)) {
    registry.register({
      name,
      description: name,
      input: z.object({}).strict(),
      output: z.object({}),
      parameters: { type: "object", properties: {}, additionalProperties: false },
      capability,
      approval: "never",
      timeoutMs: 100,
      resultBudgetTokens: 100,
      provenance: () => [],
      run: async () => ({}),
    })
  }
  return registry
}

const tools = registryWith({
  read_note: "read_note",
  propose_revision: "propose_revision",
  search_wikipedia: "wikipedia",
})
const names = (list: readonly { name: string }[]) => list.map((tool) => tool.name)

describe("offeredTools", () => {
  it("withholds propose_revision while exploring", () => {
    expect(names(offeredTools(tools, "explore", { networkResearchEnabled: true }))).not.toContain(
      "propose_revision"
    )
  })

  it("offers propose_revision when revising", () => {
    expect(names(offeredTools(tools, "revise", { networkResearchEnabled: false }))).toContain(
      "propose_revision"
    )
  })

  it("hides network tools until research is enabled", () => {
    expect(names(offeredTools(tools, "explore", { networkResearchEnabled: false }))).toEqual(["read_note"])
    expect(names(offeredTools(tools, "explore", { networkResearchEnabled: true }))).toContain(
      "search_wikipedia"
    )
  })
})
