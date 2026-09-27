import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ToolRegistry } from "../src/tools/registry"
import { registerVaultTools } from "../src/tools/vault-tools"
import { registerWikipediaTools } from "../src/tools/wikipedia"

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

  it("vault tool schemas stay strict and expose their required fields", () => {
    const registry = new ToolRegistry()
    registerVaultTools(registry, { listNotes: () => [], readNote: async () => null })

    const search = registry.get("search_vault")!
    const read = registry.get("read_note")!
    expect(search.input.safeParse({ query: "노트" }).success).toBe(true)
    expect(search.input.safeParse({ query: "노트", extra: true }).success).toBe(false)
    expect(search.parameters).toMatchObject({ required: ["query"], additionalProperties: false })
    expect(read.parameters).toMatchObject({ required: ["path"], additionalProperties: false })
    const pathSchema = (read.parameters.properties as Record<string, { pattern?: string }>).path
    const pattern = new RegExp(pathSchema?.pattern ?? "")
    expect(pattern.test("Notes/Safe.md")).toBe(true)
    expect(pattern.test("../secret.md")).toBe(false)
    expect(pattern.test("image.png")).toBe(false)
  })

  it("Wikipedia schemas expose IDs rather than query text or URLs", () => {
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, vi.fn() as unknown as typeof fetch)

    expect(registry.get("search_wikipedia")?.parameters).toMatchObject({
      required: ["topicId"],
      additionalProperties: false,
    })
    expect(registry.get("read_wikipedia_page")?.parameters).toMatchObject({
      required: ["pageId", "language"],
      additionalProperties: false,
    })
    expect(JSON.stringify(registry.definitions().map((tool) => tool.parameters))).not.toContain("url")
    expect(JSON.stringify(registry.definitions().map((tool) => tool.parameters))).not.toContain("query")
  })
})
