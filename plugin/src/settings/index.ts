/*
 * Persisted settings, through Obsidian's loadData/saveData.
 *
 * Nothing framework-shaped is stored here. TECH_STACK.md: the plugin "does not
 * expose LangChain objects directly to the Chat UI, Vault adapters, or
 * persisted settings" — a settings file is forever, and a serialised SDK object
 * in one is a migration nobody wants.
 */

import type { SelectedStyle } from "../context/packet"

export interface FathomarkSettings {
  /** Where the local provider listens. Localhost only in the MVP. */
  readonly providerBaseUrl: string
  readonly model: string
  /**
   * Wikipedia Research. Off by default: PRODUCT.md principle 5 makes every
   * network tool a conscious opt-in.
   */
  readonly networkResearchEnabled: boolean
  readonly selectedStyle: SelectedStyle | null
}

export const DEFAULT_SETTINGS: FathomarkSettings = {
  providerBaseUrl: "http://127.0.0.1:11434",
  model: "fake",
  networkResearchEnabled: false,
  selectedStyle: null,
}

/** Tolerates a settings file written by an older version, or a corrupt one. */
export function parseSettings(raw: unknown): FathomarkSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS
  const value = raw as Partial<Record<keyof FathomarkSettings, unknown>>
  return {
    providerBaseUrl:
      typeof value.providerBaseUrl === "string"
        ? value.providerBaseUrl
        : DEFAULT_SETTINGS.providerBaseUrl,
    model: typeof value.model === "string" ? value.model : DEFAULT_SETTINGS.model,
    networkResearchEnabled:
      typeof value.networkResearchEnabled === "boolean"
        ? value.networkResearchEnabled
        : DEFAULT_SETTINGS.networkResearchEnabled,
    selectedStyle: parseSelectedStyle(value.selectedStyle),
  }
}

function parseSelectedStyle(value: unknown): SelectedStyle | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Partial<Record<keyof SelectedStyle, unknown>>
  return typeof candidate.id === "string" && typeof candidate.text === "string"
    ? { id: candidate.id, text: candidate.text }
    : null
}

/**
 * What the settings tab needs, and nothing more.
 *
 * It used to take the plugin class itself, which made main.ts and the settings
 * tab import each other. Depending on the capability instead of the object
 * breaks that cycle and says plainly what the tab is allowed to touch.
 */
export interface SettingsHost {
  readonly settings: FathomarkSettings
  updateSettings(patch: Partial<FathomarkSettings>): Promise<void>
}
