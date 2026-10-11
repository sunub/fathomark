import { z } from "zod"

import type { ExternalEvidenceReference } from "../context/evidence"
import type { ToolRegistry } from "./registry"
import {
  canonicalUrl,
  endpoint,
  ensureResearchEnabled,
  fetchJson,
  object,
  wikipediaOutputSchema,
} from "./wikipedia-shared"

const searchInput = z.object({ topicId: z.string().min(1) }).strict()

export function registerSearchWikipedia(registry: ToolRegistry, fetchImpl: typeof fetch = fetch): void {
  registry.register({
    name: "search_wikipedia",
    description: "Search Wikipedia for the public topic explicitly entered by the user.",
    input: searchInput,
    output: wikipediaOutputSchema,
    parameters: {
      type: "object",
      properties: { topicId: { type: "string", minLength: 1 } },
      required: ["topicId"],
      additionalProperties: false,
    },
    capability: "wikipedia",
    approval: "never",
    timeoutMs: 10_000,
    resultBudgetTokens: 1_400,
    provenance: (output) => output.references,
    run: async ({ topicId }, context) => {
      const topic = context.researchTopic
      if (!topic || topic.id !== topicId) throw new Error("The research topic ID does not match this run.")
      ensureResearchEnabled(context)
      const url = endpoint(topic.language)
      url.search = new URLSearchParams({
        action: "query",
        format: "json",
        list: "search",
        srsearch: topic.text,
        srlimit: "5",
        utf8: "1",
      }).toString()
      context.onResearchQuery(topic.text, topic.language)
      const data = object(await fetchJson(url, fetchImpl, context.signal))
      context.signal.throwIfAborted()
      const query = object(data.query)
      const search = Array.isArray(query.search) ? query.search.slice(0, 5) : []
      const references: ExternalEvidenceReference[] = []
      for (const raw of search) {
        const result = object(raw)
        if (typeof result.pageid !== "number" || typeof result.title !== "string") continue
        context.allowedWikipediaPages.add(`${topic.language}:${result.pageid}`)
        references.push({
          kind: "external",
          source: "wikipedia",
          title: result.title,
          url: canonicalUrl(topic.language, result.title),
          excerpt: stripHtml(typeof result.snippet === "string" ? result.snippet : ""),
          pageId: result.pageid,
          language: topic.language,
        })
      }
      return { references, omitted: [] }
    },
  })
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&")
}
