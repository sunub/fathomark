/*
 * Vault reads, behind a product-owned surface.
 *
 * Two of Obsidian's plugin guidelines are structural rather than stylistic, and
 * this file is where they are honoured once instead of everywhere:
 *
 *   - Use the Vault API, not the Adapter API.
 *   - Resolve a path with getFileByPath; do not iterate every file to find one.
 *
 * Keeping them here also means src/harness never imports `obsidian`, so the
 * harness stays testable without an Obsidian runtime.
 */

import { type App, TFile, normalizePath } from "obsidian"

import type { VaultEvidenceReference } from "../context/evidence"

export interface NoteSummary {
  readonly path: string
  readonly title: string
}

export class VaultAdapter {
  constructor(private readonly app: App) {}

  /** Markdown notes only. Attachments are out of MVP scope. */
  listNotes(): NoteSummary[] {
    return this.app.vault.getMarkdownFiles().map((file) => ({
      path: file.path,
      title: file.basename,
    }))
  }

  async readNote(path: string): Promise<string | null> {
    const file = this.app.vault.getFileByPath(normalizePath(path))
    if (!(file instanceof TFile)) return null
    // cachedRead: we are reading to show, not to modify.
    return this.app.vault.cachedRead(file)
  }

  /**
   * Vault evidence always carries its path, so a claim can be traced back.
   * CONTEXT.md rejects a "filename-only label" as a reference.
   */
  async evidenceFrom(path: string, excerpt: string, heading?: string): Promise<VaultEvidenceReference | null> {
    const file = this.app.vault.getFileByPath(normalizePath(path))
    if (!(file instanceof TFile)) return null
    return heading === undefined
      ? { kind: "vault", path: file.path, excerpt }
      : { kind: "vault", path: file.path, heading, excerpt }
  }
}
