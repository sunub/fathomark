import type { SemanticBackend } from "./hybrid-search"
import type { ExperienceRule } from "./note-kind"
import { registerReadNote } from "./read-note"
import type { ToolRegistry } from "./registry"
import { registerSearchVault } from "./search-vault"
import type { VaultReader } from "./vault-search"

export type { VaultReader } from "./vault-search"

/** Each tool owns its contract in its own file; this only registers them together. */
export function registerVaultTools(
  registry: ToolRegistry,
  vault: VaultReader,
  experienceRule?: () => ExperienceRule,
  semantic?: () => SemanticBackend | undefined
): void {
  registerSearchVault(registry, vault, experienceRule, semantic)
  registerReadNote(registry, vault)
}
