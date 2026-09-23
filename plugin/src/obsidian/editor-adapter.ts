/*
 * The active note and selection, and the one path that writes to the vault.
 *
 * `applyInsertion` deliberately takes a preview the user already approved,
 * rather than text straight from a model. PRODUCT.md acceptance criterion 9 is
 * "No vault file changes before explicit approval", and criterion 10 is that
 * the change can be undone through Obsidian — which is why this goes through
 * the editor transaction rather than a Vault.modify() rewrite.
 */

import { type App, MarkdownView } from "obsidian"

import type { CurrentNoteContext } from "../context/packet"

export interface ApprovedInsertion {
  readonly path: string
  readonly text: string
  /** Guards against the user having moved on since the preview was built. */
  readonly expectedSelection: string | null
}

export class EditorAdapter {
  constructor(private readonly app: App) {}

  currentNote(): CurrentNoteContext | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view) return null

    const selection = view.editor.getSelection()
    return {
      path: view.file?.path ?? "",
      title: view.file?.basename ?? "Untitled",
      text: selection.length > 0 ? selection : view.editor.getValue(),
      isSelection: selection.length > 0,
    }
  }

  /**
   * Returns why the insertion was refused, or null on success. Refusing is the
   * normal outcome when the user switched notes while the preview was open —
   * writing to whatever happens to be focused now would be a silent edit to the
   * wrong file.
   */
  applyInsertion(insertion: ApprovedInsertion): string | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view) return "No note is open."
    if (view.file?.path !== insertion.path) {
      return `The preview was built for ${insertion.path}, which is no longer the active note.`
    }

    const selection = view.editor.getSelection()
    if (insertion.expectedSelection !== null && selection !== insertion.expectedSelection) {
      return "The selection changed since the preview was built."
    }

    // One editor transaction, so Obsidian's own undo reverses it in one step.
    if (insertion.expectedSelection !== null) view.editor.replaceSelection(insertion.text)
    else view.editor.replaceRange(insertion.text, view.editor.getCursor())

    return null
  }
}
