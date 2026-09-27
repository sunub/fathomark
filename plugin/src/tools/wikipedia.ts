import { z } from "zod"

import type { ExternalEvidenceReference } from "../context/evidence"
import type { ToolExecutionContext, ToolRegistry } from "./registry"

const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_EXCERPT_BYTES = 4_096

interface WikipediaOutput {
  readonly references: ExternalEvidenceReference[]
  readonly omitted: string[]
}

const searchInput = z.object({ topicId: z.string().min(1) }).strict()
const readInput = z.object({ pageId: z.number().int().positive(), language: z.enum(["ko", "en"]) }).strict()
const referenceSchema = z.object({
  kind: z.literal("external"),
  source: z.literal("wikipedia"),
  title: z.string(),
  url: z.string().url(),
  excerpt: z.string(),
  pageId: z.number().int().positive().optional(),
  language: z.enum(["ko", "en"]).optional(),
})
const outputSchema = z.object({
  references: z.array(referenceSchema),
  omitted: z.array(z.string()),
}) as unknown as z.ZodType<WikipediaOutput>

export function registerWikipediaTools(registry: ToolRegistry, fetchImpl: typeof fetch = fetch): void {
  registry.register({
    name: "search_wikipedia",
    description: "Search Wikipedia for the public topic explicitly entered by the user.",
    input: searchInput,
    output: outputSchema,
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

  registry.register({
    name: "read_wikipedia_page",
    description: "Read a page returned by Wikipedia search in this run.",
    input: readInput,
    output: outputSchema,
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
      return {
        references,
        omitted: excerpt.omitted,
      }
    },
  })
}

function ensureResearchEnabled(context: ToolExecutionContext): void {
  if (!context.permissions().networkResearchEnabled) {
    throw new Error("Wikipedia Research is off.")
  }
  context.signal.throwIfAborted()
}

function endpoint(language: "ko" | "en"): URL {
  return new URL(`https://${language}.wikipedia.org/w/api.php`)
}

async function fetchJson(url: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "error",
    headers: { "Api-User-Agent": "Fathomark/0.0.1 (https://github.com/sunub/fathomark)" },
  })
  signal.throwIfAborted()
  if (response.redirected) throw new Error("Wikipedia redirects are not allowed.")
  if (!response.ok) throw new Error(`Wikipedia request failed with ${response.status}.`)
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Wikipedia response exceeds 1 MiB.")
  const bytes = await readLimited(response, signal)
  signal.throwIfAborted()
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    throw new Error(`Wikipedia returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function readLimited(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_RESPONSE_BYTES) throw new Error("Wikipedia response exceeds 1 MiB.")
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
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

function canonicalUrl(language: "ko" | "en", title: string): string {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&")
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
