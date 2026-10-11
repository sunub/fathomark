import { describe, expect, it, vi } from "vitest"

import { decide } from "../src/harness/policy"
import { ToolRegistry } from "../src/tools/registry"
import type { ToolExecutionContext } from "../src/tools/registry"
import {
  registerSearchPublicSourcesTool,
  type PublicCandidate,
  type PublicSearchOutcome,
  type PublicSourceSearcher,
} from "../src/tools/search-public-sources"

function context(signal = new AbortController().signal): ToolExecutionContext {
  return {
    signal,
    researchTopic: null,
    allowedWikipediaPages: new Set(),
    permissions: () => ({ networkResearchEnabled: false }),
    onResearchQuery: () => {},
  }
}

function candidate(n: number, overrides: Partial<PublicCandidate> = {}): PublicCandidate {
  return {
    candidateId: `C${n}`,
    title: `후보 ${n}`,
    url: `https://example.com/${n}`,
    summary: "요약",
    publisher: "example.com",
    official: n === 1,
    ...overrides,
  }
}

function setup(outcome: PublicSearchOutcome | Error, vaultOnlyTerms: string[] = ["내부프로젝트오로라"]) {
  const search = vi.fn<PublicSourceSearcher["search"]>(async () => {
    if (outcome instanceof Error) throw outcome
    return outcome
  })
  const registry = new ToolRegistry()
  registerSearchPublicSourcesTool(registry, { search }, { vaultOnlyTerms: () => vaultOnlyTerms })
  return { tool: registry.get("search_public_sources")!, search }
}

describe("search_public_sources", () => {
  it("returns candidates without references and omits unreported dates", async () => {
    const { tool, search } = setup({ status: "ok", candidates: [candidate(1), candidate(2, { publishedAt: "2026-09-01" })] })
    const output = (await tool.run({ query: "토스 백엔드 채용", scope: "company" } as never, context())) as {
      candidates: PublicCandidate[]
    }

    expect(search).toHaveBeenCalledWith({ query: "토스 백엔드 채용", scope: "company", limit: 5 }, expect.any(AbortSignal))
    expect(output.candidates).toHaveLength(2)
    expect("publishedAt" in output.candidates[0]!).toBe(false)
    expect(output.candidates[1]?.publishedAt).toBe("2026-09-01")
    expect(tool.output.safeParse(output).success).toBe(true)
    expect(tool.provenance(output as never)).toEqual([])
  })

  it("blocks a query containing a vault-only term before calling the searcher", async () => {
    const { tool, search } = setup({ status: "ok", candidates: [] })
    const output = await tool.run({ query: "내부프로젝트오로라 경쟁사", scope: "industry" } as never, context())

    expect(search).not.toHaveBeenCalled()
    expect(output).toMatchObject({ candidates: [], error: { code: "egress_blocked" } })
  })

  it("blocks URLs, paths and control characters", async () => {
    const { tool, search } = setup({ status: "ok", candidates: [] })
    for (const query of ["https://secret.example", "Notes/경험.md", "a\u0007b"]) {
      const output = await tool.run({ query, scope: "role" } as never, context())
      expect(output).toMatchObject({ error: { code: "egress_blocked" } })
    }
    expect(search).not.toHaveBeenCalled()
  })

  it("keeps no relevant candidates apart from a service error", async () => {
    const empty = await setup({ status: "ok", candidates: [] }).tool.run({ query: "회사", scope: "company" } as never, context())
    const failed = await setup(new Error("503")).tool.run({ query: "회사", scope: "company" } as never, context())

    expect(empty).toEqual({ candidates: [], omitted: [] })
    expect(failed).toMatchObject({ candidates: [], error: { code: "service_error" } })
  })

  it("reports an exhausted limit as its own error", async () => {
    const output = await setup({ status: "limit_exhausted" }).tool.run({ query: "회사", scope: "company" } as never, context())
    expect(output).toMatchObject({ error: { code: "limit_exhausted" } })
  })

  it("does not turn a Stop into a service error", async () => {
    const controller = new AbortController()
    const { tool } = setup(new Error("aborted"))
    controller.abort()
    await expect(tool.run({ query: "회사", scope: "company" } as never, context(controller.signal))).rejects.toBeDefined()
  })

  it("drops non-https results and enforces the limit, saying so", async () => {
    const { tool } = setup({
      status: "ok",
      candidates: [candidate(1), candidate(2, { url: "http://example.com/2" }), candidate(3), candidate(4)],
    })
    const output = (await tool.run({ query: "회사", scope: "company", limit: 2 } as never, context())) as {
      candidates: PublicCandidate[]
      omitted: string[]
    }

    expect(output.candidates.map((c) => c.candidateId)).toEqual(["C1", "C3"])
    expect(output.omitted).toHaveLength(2)
  })

  it("rejects unknown fields and an out-of-range limit, and stays refused by policy", () => {
    const { tool } = setup({ status: "ok", candidates: [] })
    expect(tool.input.safeParse({ query: "회사", scope: "company", extra: 1 }).success).toBe(false)
    expect(tool.input.safeParse({ query: "회사", scope: "company", limit: 6 }).success).toBe(false)
    expect(tool.input.safeParse({ query: "회사", scope: "web" }).success).toBe(false)
    expect(tool.parameters).toMatchObject({ required: ["query", "scope"], additionalProperties: false })
    expect(decide(tool.capability, { networkResearchEnabled: true }).allowed).toBe(false)
  })
})
