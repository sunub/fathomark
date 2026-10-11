import { registerReadWikipediaPage } from "./read-wikipedia"
import type { ToolRegistry } from "./registry"
import { registerSearchWikipedia } from "./search-wikipedia"

/** Registers both Wikipedia tools; each owns its contract in its own file. */
export function registerWikipediaTools(registry: ToolRegistry, fetchImpl: typeof fetch = fetch): void {
  registerSearchWikipedia(registry, fetchImpl)
  registerReadWikipediaPage(registry, fetchImpl)
}
