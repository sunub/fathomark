import { describe, expect, it } from "vitest"
import { z } from "zod"

import { ToolRegistry } from "../src/tools/registry"

describe("product contracts", () => {
  it("registry schemas describe the same accepted input", () => {
    const registry = new ToolRegistry()
    registry.register({
      name: "search_vault",
      description: "Search the vault",
      input: z.object({ query: z.string(), limit: z.number().int().max(10).optional() }).strict(),
      output: z.object({ matches: z.array(z.string()) }),
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", maximum: 10 },
        },
        required: ["query"],
        additionalProperties: false,
      },
      capability: "search_vault",
      approval: "never",
      timeoutMs: 10_000,
      resultBudgetTokens: 256,
      provenance: () => [],
      run: async ({ query }) => ({ matches: [query] }),
    })

    const [definition] = registry.definitions()
    expect(definition?.input.safeParse({ query: "노트" }).success).toBe(true)
    expect(definition?.input.safeParse({ query: "노트", extra: true }).success).toBe(false)
    expect(definition?.parameters).toMatchObject({
      required: ["query"],
      additionalProperties: false,
    })
  })
})
