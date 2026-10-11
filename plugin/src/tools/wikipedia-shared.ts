import { z } from "zod"

import type { ExternalEvidenceReference } from "../context/evidence"
import type { ToolExecutionContext } from "./registry"

const MAX_RESPONSE_BYTES = 1024 * 1024

/** What `search_wikipedia` and `read_wikipedia_page` share: the public references found and what was left out. */
export interface WikipediaOutput {
  readonly references: ExternalEvidenceReference[]
  readonly omitted: string[]
}

const referenceSchema = z.object({
  kind: z.literal("external"),
  source: z.literal("wikipedia"),
  title: z.string(),
  url: z.string().url(),
  excerpt: z.string(),
  pageId: z.number().int().positive().optional(),
  language: z.enum(["ko", "en"]).optional(),
})

export const wikipediaOutputSchema = z.object({
  references: z.array(referenceSchema),
  omitted: z.array(z.string()),
}) as unknown as z.ZodType<WikipediaOutput>

export function ensureResearchEnabled(context: ToolExecutionContext): void {
  if (!context.permissions().networkResearchEnabled) {
    throw new Error("Wikipedia Research is off.")
  }
  context.signal.throwIfAborted()
}

export function endpoint(language: "ko" | "en"): URL {
  return new URL(`https://${language}.wikipedia.org/w/api.php`)
}

export async function fetchJson(url: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<unknown> {
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

export function canonicalUrl(language: "ko" | "en", title: string): string {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
}

export function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
