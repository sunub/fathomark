import { type App, MarkdownView, type WorkspaceLeaf } from "obsidian"

import type { EditorPosition } from "../context/insertion"

export type { EditorPosition } from "../context/insertion"

export interface EditorTarget {
  readonly id: string
  readonly path: string
  readonly text: string
  readonly selection: string
  readonly from: EditorPosition
  readonly to: EditorPosition
}

export class EditorTargetTracker {
  private lastView: MarkdownView | null
  private readonly views = new Map<string, MarkdownView>()
  private readonly eventRef: ReturnType<App["workspace"]["on"]>
  private sequence = 0

  constructor(private readonly app: App) {
    this.lastView = app.workspace.getActiveViewOfType(MarkdownView)
    this.eventRef = app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
      if (leaf?.view instanceof MarkdownView) this.lastView = leaf.view
    })
  }

  capture(): EditorTarget | null {
    const view = this.lastView
    if (!view || !this.isOpen(view) || !view.file) return null
    const range = view.editor.listSelections()[0]
    const cursor = view.editor.getCursor()
    const from = range ? earlier(range.anchor, range.head) : cursor
    const to = range ? later(range.anchor, range.head) : cursor
    const id = `target-${(++this.sequence).toString(16).padStart(4, "0")}`
    this.views.set(id, view)
    return {
      id,
      path: view.file.path,
      text: view.editor.getValue(),
      selection: view.editor.getSelection(),
      from,
      to,
    }
  }

  viewFor(id: string): MarkdownView | null {
    const view = this.views.get(id) ?? null
    return view && this.isOpen(view) ? view : null
  }

  dispose(): void {
    this.app.workspace.offref(this.eventRef)
    this.views.clear()
    this.lastView = null
  }

  private isOpen(view: MarkdownView): boolean {
    return this.app.workspace.getLeavesOfType("markdown").some((leaf) => leaf.view === view)
  }
}

function earlier(left: EditorPosition, right: EditorPosition): EditorPosition {
  return left.line < right.line || (left.line === right.line && left.ch <= right.ch) ? left : right
}

function later(left: EditorPosition, right: EditorPosition): EditorPosition {
  return earlier(left, right) === left ? right : left
}
