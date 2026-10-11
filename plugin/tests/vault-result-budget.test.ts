import { describe, expect, it } from "vitest"

import type { ToolExecutionContext } from "../src/tools/registry"
import { createToolRegistry } from "../src/tools/create-registry"
import { boundVaultOutput, type VaultToolOutput } from "../src/tools/vault-output"

const count = (text: string) => new TextEncoder().encode(text).length
const context: ToolExecutionContext = {
  signal: new AbortController().signal, researchTopic: null, allowedWikipediaPages: new Set(),
  permissions: () => ({ networkResearchEnabled: false }), onResearchQuery: () => {}, countResultTokens: count,
}
const paragraphs = ["가".repeat(150), "나".repeat(150), "다".repeat(150), "라".repeat(150)]
const excerpt = paragraphs.join("\r\n\r\n")
const output: VaultToolOutput = {
  references: [{ kind: "vault", path: "경험.md", heading: "협업", excerpt }], omitted: [],
}

describe("vault result budget", () => {
  it("keeps complete original paragraphs, path and heading with an explicit omission", () => {
    const bounded = boundVaultOutput(output, count)
    expect(count(JSON.stringify(bounded))).toBeLessThanOrEqual(1400)
    expect(bounded.references[0]).toMatchObject({ path: "경험.md", heading: "협업" })
    expect(bounded.references[0]!.excerpt).toBe(paragraphs.slice(0, 2).join("\r\n\r\n"))
    expect(excerpt).toContain(bounded.references[0]!.excerpt)
    expect(bounded.omitted.join(" ")).toMatch(/budget/i)
    expect(bounded.omitted.join(" ")).toMatch(/2 paragraphs/)
  })

  it("returns no evidence when a single whole paragraph cannot fit", () => {
    const bounded = boundVaultOutput({ ...output, references: [{ ...output.references[0]!, excerpt: "가".repeat(1000) }] }, count)
    expect(bounded.references).toEqual([])
    expect(bounded.omitted.join(" ")).toMatch(/1 paragraphs/)
    expect(count(JSON.stringify(bounded))).toBeLessThanOrEqual(1400)
  })

  it("bounds combined references and preserves existing omission reports", () => {
    const combined = {
      references: paragraphs.map((text, index) => ({ kind: "vault" as const, path: `note-${index}.md`, excerpt: text })),
      omitted: ["Only the first 1,000 notes were searched."], supported: true,
    }
    const bounded = boundVaultOutput(combined, count)
    expect(count(JSON.stringify(bounded))).toBeLessThanOrEqual(1400)
    expect(bounded.references.length).toBeLessThan(4)
    expect(bounded.supported).toBe(true)
    expect(bounded.omitted).toContain(combined.omitted[0])
  })

  it("returns unbounded output unchanged when a result counter is absent", () => {
    expect(boundVaultOutput(output)).toBe(output)
  })

  it("read_note fits the declared cap instead of making normal long Korean notes fail", async () => {
    const noteText = paragraphs.join("\n\n")
    const registry = createToolRegistry({
      vault: { listNotes: () => [], readNote: async () => noteText }, experienceFolder: () => "",
    })
    const tool = registry.get("read_note")!
    const bounded = await tool.run({ path: "경험.md" } as never, context) as VaultToolOutput
    expect(count(JSON.stringify(bounded))).toBeLessThanOrEqual(tool.resultBudgetTokens)
    expect(bounded.references).toHaveLength(1)
    expect(bounded.omitted.length).toBeGreaterThan(0)
    expect(noteText).toContain(bounded.references[0]!.excerpt)
    const { countResultTokens: _counter, ...unboundedContext } = context
    const unbounded = await tool.run({ path: "경험.md" } as never, unboundedContext) as VaultToolOutput
    expect(unbounded.references[0]!.excerpt).toBe(noteText)
  })

  it("search_vault reports unsupported when the budget removes all evidence", async () => {
    const text = `협업 ${"가".repeat(900)}`
    const registry = createToolRegistry({
      vault: { listNotes: () => [{ path: "경험.md", title: "협업", mtime: 0 }], readNote: async () => text },
      experienceFolder: () => "",
    })
    const tool = registry.get("search_vault")!
    const bounded = await tool.run({ query: "협업", limit: 3 } as never, context) as VaultToolOutput & { supported: boolean; reason: string }
    expect(bounded.references).toEqual([])
    expect(bounded.supported).toBe(false)
    expect(bounded.reason).toBe("below_threshold")
    expect(bounded.omitted.length).toBeGreaterThan(0)
    expect(count(JSON.stringify(bounded))).toBeLessThanOrEqual(tool.resultBudgetTokens)
  })
})
