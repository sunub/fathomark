/*
 * The active note and selection, and the one path that writes to the vault.
 *
 * Writes live in PreviewController so text from a model cannot reach the editor
 * without a target-bound preview and explicit approval.
 */

import { type App, MarkdownView } from "obsidian"

import type { CurrentNoteContext } from "../context/packet"
import type { EditorTarget, EditorTargetTracker } from "./editor-target"

export class EditorAdapter {
  constructor(private readonly app: App, private readonly tracker?: EditorTargetTracker) {}

  currentNote(): CurrentNoteContext | null {
    const target = this.captureTarget()
    if (target) return this.noteFromTarget(target)
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

  captureTarget(): EditorTarget | null {
    return this.tracker?.capture() ?? null
  }

  noteFromTarget(target: EditorTarget): CurrentNoteContext {
    return {
      path: target.path,
      title: target.path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "Untitled",
      text: target.selection || target.text,
      isSelection: target.selection.length > 0,
    }
  }

  currentSelection(): string | null {
    const target = this.tracker?.capture()
    if (target) return target.selection || null
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const selection = view?.editor.getSelection() ?? ""
    return selection || null
  }
}
