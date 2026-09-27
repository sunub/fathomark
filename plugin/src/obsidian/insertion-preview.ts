import type { MarkdownView } from "obsidian"

import type { EditorPosition, InsertionPreview } from "../context/insertion"
import type { EditorTarget } from "./editor-target"

export type { InsertionPreview } from "../context/insertion"

interface TargetResolver {
  viewFor(id: string): MarkdownView | null
}

interface StoredPreview {
  readonly target: EditorTarget
  readonly generatedText: string
  preview: InsertionPreview
}

export class PreviewController {
  private readonly previews = new Map<string, StoredPreview>()
  private sequence = 0

  constructor(private readonly targets: TargetResolver) {}

  create(target: EditorTarget, generatedText: string): InsertionPreview {
    const preview: InsertionPreview = {
      id: `preview-${(++this.sequence).toString(16).padStart(4, "0")}`,
      targetId: target.id,
      path: target.path,
      from: target.from,
      to: target.to,
      before: target.selection,
      after: generatedText,
      status: "pending",
    }
    this.previews.set(preview.id, { target, generatedText, preview })
    return preview
  }

  get(id: string): InsertionPreview | null {
    return this.previews.get(id)?.preview ?? null
  }

  approve(id: string): { ok: true } | { ok: false; reason: string } {
    const stored = this.previews.get(id)
    if (!stored || stored.preview.status !== "pending") {
      return { ok: false, reason: "This preview is not pending." }
    }
    const view = this.targets.viewFor(stored.target.id)
    if (!view || !view.file || !this.matches(view, stored.target)) {
      stored.preview = { ...stored.preview, status: "stale" }
      return { ok: false, reason: "문서가 바뀌었습니다. 미리보기를 다시 만들어 주세요." }
    }
    view.editor.replaceRange(stored.generatedText, stored.target.from, stored.target.to)
    stored.preview = { ...stored.preview, status: "applied" }
    return { ok: true }
  }

  discard(id: string): void {
    const stored = this.previews.get(id)
    if (stored?.preview.status === "pending") {
      stored.preview = { ...stored.preview, status: "discarded" }
    }
  }

  dispose(): void {
    this.previews.clear()
  }

  private matches(view: MarkdownView, target: EditorTarget): boolean {
    if (view.file?.path !== target.path || view.editor.getValue() !== target.text) return false
    if (view.editor.getSelection() !== target.selection) return false
    const range = view.editor.listSelections()[0]
    if (!range) return samePosition(view.editor.getCursor(), target.from) && samePosition(target.from, target.to)
    const from = earlier(range.anchor, range.head)
    const to = later(range.anchor, range.head)
    return samePosition(from, target.from) && samePosition(to, target.to)
  }
}

function samePosition(left: EditorPosition, right: EditorPosition): boolean {
  return left.line === right.line && left.ch === right.ch
}

function earlier(left: EditorPosition, right: EditorPosition): EditorPosition {
  return left.line < right.line || (left.line === right.line && left.ch <= right.ch) ? left : right
}

function later(left: EditorPosition, right: EditorPosition): EditorPosition {
  return earlier(left, right) === left ? right : left
}
