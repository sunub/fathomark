/*
 * `obsidian` has no npm implementation — the app provides it at runtime. Tests
 * that reach it resolve here instead (see vitest.config.ts).
 *
 * Deliberately minimal. If a test needs more of Obsidian than this, that is
 * usually a sign the logic under test belongs on the other side of an adapter.
 */
export class TFile {
  constructor(public path = "", public basename = "") {}
}
export class ItemView {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class MarkdownView {}
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/")
}
