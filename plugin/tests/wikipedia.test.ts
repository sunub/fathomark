import { describe, expect, it, vi } from "vitest"

import { executeTool } from "../src/harness/tool-executor"
import type { ToolExecutionContext } from "../src/tools/registry"
import { ToolRegistry } from "../src/tools/registry"
import { createResearchTopic } from "../src/tools/research-topic"
import { registerWikipediaTools } from "../src/tools/wikipedia"

function jsonResponse(value: unknown): Response {
  return Response.json(value)
}

function context(
  topic = createResearchTopic("공개 주제", "ko"),
  enabled = true,
  signal = new AbortController().signal,
  onResearchQuery = vi.fn()
): ToolExecutionContext {
  return {
    signal,
    researchTopic: topic,
    allowedWikipediaPages: new Set(),
    permissions: () => ({ networkResearchEnabled: enabled }),
    onResearchQuery,
  }
}

describe("research topic", () => {
  it.each(["", "https://example.com", "Notes/secret.md", "bad\u0000topic", "a".repeat(121)])(
    "rejects non-public topic %j",
    (value) => expect(() => createResearchTopic(value, "ko")).toThrow()
  )

  it("rejects unsupported languages at runtime", () => {
    expect(() => createResearchTopic("topic", "ja" as never)).toThrow(/language/i)
  })
})

describe("Wikipedia tools", () => {
  it("never copies vault or model sentinel text into the search request", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      jsonResponse({ query: { search: [{ pageid: 1, title: "공개", snippet: "설명" }] } })
    )
    const fetchSpy = fetchMock as unknown as typeof fetch
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, fetchSpy)
    const toolContext = context()

    await executeTool(
      { callId: "c1", name: "search_wikipedia", args: { topicId: toolContext.researchTopic?.id, injected: "VAULT_SECRET_SENTINEL" } },
      registry,
      () => ({ networkResearchEnabled: true }),
      toolContext
    ).catch(() => {})

    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("VAULT_SECRET_SENTINEL")
  })

  it("performs no fetch when research permission is off", async () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, fetchSpy)
    const toolContext = context(createResearchTopic("topic", "en"), false)

    await expect(
      executeTool(
        { callId: "c1", name: "search_wikipedia", args: { topicId: toolContext.researchTopic?.id } },
        registry,
        () => ({ networkResearchEnabled: false }),
        toolContext
      )
    ).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects a mismatched topic id before fetch", async () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, fetchSpy)
    const search = registry.get("search_wikipedia")!

    await expect(search.run({ topicId: "other" } as never, context())).rejects.toThrow(/topic/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("uses exactly the displayed research query in the URL", async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      jsonResponse({ query: { search: [] } })
    )
    const fetchSpy = fetchMock as unknown as typeof fetch
    const onResearchQuery = vi.fn()
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, fetchSpy)
    const toolContext = context(createResearchTopic("Exact Public Topic", "en"), true, undefined, onResearchQuery)
    const search = registry.get("search_wikipedia")!

    await search.run({ topicId: toolContext.researchTopic?.id } as never, toolContext)

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.origin + url.pathname).toBe("https://en.wikipedia.org/w/api.php")
    expect(url.searchParams.get("srsearch")).toBe("Exact Public Topic")
    expect(onResearchQuery).toHaveBeenCalledWith("Exact Public Topic", "en")
  })

  it("allows reading only page ids returned by this run and language", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ query: { pages: {} } })) as unknown as typeof fetch
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, fetchSpy)
    const read = registry.get("read_wikipedia_page")!
    const toolContext = context(createResearchTopic("topic", "en"))

    await expect(read.run({ pageId: 99, language: "en" } as never, toolContext)).rejects.toThrow(/not authorized/i)
    toolContext.allowedWikipediaPages.add("en:99")
    await expect(read.run({ pageId: 99, language: "ko" } as never, toolContext)).rejects.toThrow(/language/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects redirects", async () => {
    const fetchSpy = vi.fn(async () => {
      const result = jsonResponse({ query: { search: [] } })
      Object.defineProperty(result, "redirected", { value: true })
      return result
    }) as unknown as typeof fetch
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, fetchSpy)
    const search = registry.get("search_wikipedia")!

    await expect(search.run({ topicId: context().researchTopic?.id } as never, context())).rejects.toThrow(/redirect/i)
  })

  it("drops a response that arrives after cancellation", async () => {
    const controller = new AbortController()
    const fetchSpy = vi.fn(async () => {
      controller.abort(new DOMException("stop", "AbortError"))
      return jsonResponse({ query: { search: [{ pageid: 1, title: "late", snippet: "late" }] } })
    }) as unknown as typeof fetch
    const registry = new ToolRegistry()
    registerWikipediaTools(registry, fetchSpy)
    const toolContext = context(createResearchTopic("topic", "en"), true, controller.signal)
    const search = registry.get("search_wikipedia")!

    await expect(search.run({ topicId: toolContext.researchTopic?.id } as never, toolContext)).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(toolContext.allowedWikipediaPages.size).toBe(0)
  })
})
