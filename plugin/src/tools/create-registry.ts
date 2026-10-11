/*
 * The one place that decides which tools exist in the app.
 *
 * Each tool still owns its contract in its own file; this only composes them.
 * Registered is not the same as offered: the Wikipedia tools are always
 * registered, and the harness offers them to the model only while the research
 * setting allows their capability (the agent loop filters on every request).
 *
 * Deliberately absent until their wiring is complete — registering a half-built
 * tool would let the model call it:
 *   ask_user, save_working_note, read_public_source, search_public_sources
 *   (need the harness-side waiting, run state and consent paths).
 *
 * propose_revision is registered but withheld in the exploration stage (see
 * harness/stage), so only a run on a user-chosen passage can call it.
 */

import type { SemanticBackend } from "./hybrid-search"
import { experienceRuleFor } from "./note-kind"
import { registerProposeRevisionTool } from "./propose-revision"
import { registerNoteContextTool } from "./note-context"
import { ToolRegistry } from "./registry"
import { registerVaultTools, type VaultReader } from "./vault-tools"
import { registerWikipediaTools } from "./wikipedia"
import { registerAskUserTool } from "./ask-user"
import { registerReadPublicSourceTool, type PublicSourceReader } from "./read-public-source"

export interface ToolServices {
  readonly vault: VaultReader
  /** Read on every search, so a changed setting applies without rebuilding the registry. */
  readonly experienceFolder: () => string
  readonly fetchImpl?: typeof fetch
  readonly includeQuestions?: boolean
  readonly publicSources?: PublicSourceReader
  /** Read on every search. Undefined means keyword search only. */
  readonly semantic?: () => SemanticBackend | undefined
}

export function createToolRegistry(services: ToolServices): ToolRegistry {
  const registry = new ToolRegistry()
  registerVaultTools(registry, services.vault, () => experienceRuleFor(services.experienceFolder()), services.semantic)
  registerNoteContextTool(registry, services.vault)
  registerProposeRevisionTool(registry)
  registerWikipediaTools(registry, services.fetchImpl)
  if (services.includeQuestions) registerAskUserTool(registry)
  if (services.publicSources) registerReadPublicSourceTool(registry, services.publicSources)
  return registry
}
