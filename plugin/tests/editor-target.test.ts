import { MarkdownView } from "obsidian"
import { describe, expect, it, vi } from "vitest"

import { EditorTargetTracker } from "../src/obsidian/editor-target"

function markdownView() {
  const view = Object.assign(Object.create(MarkdownView.prototype), {
    file: { path: "Notes/A.md", basename: "A" },
    editor: {
      getValue: () => "before selected after",
      getSelection: () => "selected",
      listSelections: () => [{ anchor: { line: 0, ch: 7 }, head: { line: 0, ch: 15 } }],
      getCursor: () => ({ line: 0, ch: 15 }),
    },
  })
  return view
}

describe("editor target tracker", () => {
  it("keeps the last markdown target after sidebar focus and drops a closed leaf", () => {
    const view = markdownView()
    let listener: ((leaf: unknown) => void) | undefined
    let leaves: Array<{ view: unknown }> = [{ view }]
    const workspace = {
      getActiveViewOfType: () => view,
      getLeavesOfType: () => leaves,
      on: vi.fn((_name, callback) => {
        listener = callback
        return { id: "event" }
      }),
      offref: vi.fn(),
    }
    const tracker = new EditorTargetTracker({ workspace } as never)

    listener?.({ view: {} })
    expect(tracker.capture()).toMatchObject({ path: "Notes/A.md", selection: "selected" })

    leaves = []
    expect(tracker.capture()).toBeNull()
    tracker.dispose()
    expect(workspace.offref).toHaveBeenCalledOnce()
  })
})
