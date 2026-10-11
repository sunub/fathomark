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

const MAX_EXCERPT_BYTES = 4_096

const readInput = z.object({ pageId: z.number().int().positive(), language: z.enum(["ko", "en"]) }).strict()

export function registerReadWikipediaPage(registry: ToolRegistry, fetchImpl: typeof fetch = fetch): void {
  registry.register({
    name: "read_wikipedia_page",
    description: "Read a page returned by Wikipedia search in this run.",
    input: readInput,
    output: wikipediaOutputSchema,
    parameters: {
      type: "object",
      properties: {
        pageId: { type: "integer", minimum: 1 },
        language: { type: "string", enum: ["ko", "en"] },
      },
      required: ["pageId", "language"],
      additionalProperties: false,
    },
    capability: "wikipedia",
    approval: "never",
    timeoutMs: 10_000,
    resultBudgetTokens: 1_400,
    provenance: (output) => output.references,
    run: async ({ pageId, language }, context) => {
      if (context.researchTopic?.language !== language) {
        throw new Error("The page language does not match the public research topic.")
      }
      if (!context.allowedWikipediaPages.has(`${language}:${pageId}`)) {
        throw new Error("This Wikipedia page ID is not authorized for this run.")
      }
      ensureResearchEnabled(context)
      const url = endpoint(language)
      url.search = new URLSearchParams({
        action: "query",
        format: "json",
        prop: "extracts",
        explaintext: "1",
        exsectionformat: "plain",
        pageids: String(pageId),
      }).toString()
      const data = object(await fetchJson(url, fetchImpl, context.signal))
      context.signal.throwIfAborted()
      const pages = object(object(data.query).pages)
      const page = object(pages[String(pageId)])
      if (typeof page.title !== "string" || typeof page.extract !== "string") {
        return { references: [], omitted: [`Wikipedia page ${pageId} returned no plaintext extract.`] }
      }
      const excerpt = boundedParagraphs(page.extract)
      const references: ExternalEvidenceReference[] = excerpt.text
        ? [
            {
              kind: "external",
              source: "wikipedia",
              title: page.title,
              url: canonicalUrl(language, page.title),
              excerpt: excerpt.text,
              pageId,
              language,
            },
          ]
        : []
      return { references, omitted: excerpt.omitted }
    },
  })
}

function boundedParagraphs(text: string): { text: string | null; omitted: string[] } {
  const paragraphs = text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean)
  const selected: string[] = []
  const omitted: string[] = []
  for (const paragraph of paragraphs) {
    if (new TextEncoder().encode(paragraph).length > MAX_EXCERPT_BYTES) {
      omitted.push("Wikipedia paragraph exceeds 4096 UTF-8 bytes.")
      continue
    }
    const next = [...selected, paragraph].join("\n\n")
    if (new TextEncoder().encode(next).length > MAX_EXCERPT_BYTES) {
      omitted.push("Additional Wikipedia paragraphs were omitted by the 4096 UTF-8 byte limit.")
      break
    }
    selected.push(paragraph)
  }
  return { text: selected.length > 0 ? selected.join("\n\n") : null, omitted }
}
