import { describe, expect, it, vi } from "vitest"

import type { EditorTarget } from "../src/obsidian/editor-target"
import { PreviewController } from "../src/obsidian/insertion-preview"

const target: EditorTarget = {
  id: "target-1",
  path: "Note.md",
  text: "before selected after",
  selection: "selected",
  from: { line: 0, ch: 7 },
  to: { line: 0, ch: 15 },
}

function fixture(overrides: Record<string, unknown> = {}) {
  const replaceRange = vi.fn()
  const view = {
    file: { path: "Note.md" },
    editor: {
      getValue: () => "before selected after",
      getSelection: () => "selected",
      listSelections: () => [{ anchor: { line: 0, ch: 7 }, head: { line: 0, ch: 15 } }],
      getCursor: () => ({ line: 0, ch: 15 }),
      replaceRange,
      ...overrides,
    },
  }
  return { replaceRange, view }
}

describe("insertion preview controller", () => {
  it("writes nothing before approval, after discard, or for an unknown id", () => {
    const { replaceRange, view } = fixture()
    const controller = new PreviewController({ viewFor: () => view } as never)
    const preview = controller.create(target, "replacement")

    expect(replaceRange).not.toHaveBeenCalled()
    controller.discard(preview.id)
    expect(controller.approve(preview.id).ok).toBe(false)
    expect(controller.approve("unknown").ok).toBe(false)
    expect(replaceRange).not.toHaveBeenCalled()
  })

  it("applies a fixed range only once", () => {
    const { replaceRange, view } = fixture()
    const controller = new PreviewController({ viewFor: () => view } as never)
    const preview = controller.create(target, "replacement")

    expect(controller.approve(preview.id)).toEqual({ ok: true })
    expect(controller.approve(preview.id).ok).toBe(false)
    expect(replaceRange).toHaveBeenCalledTimes(1)
    expect(replaceRange).toHaveBeenCalledWith("replacement", target.from, target.to)
  })

  it.each([
    ["same text at another cursor", { listSelections: () => [{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 8 } }] }],
    ["changed body", { getValue: () => "changed" }],
    ["changed selection", { getSelection: () => "other" }],
  ])("refuses %s", (_name, overrides) => {
    const { replaceRange, view } = fixture(overrides)
    const controller = new PreviewController({ viewFor: () => view } as never)
    const preview = controller.create(target, "replacement")

    expect(controller.approve(preview.id).ok).toBe(false)
    expect(replaceRange).not.toHaveBeenCalled()
    expect(controller.get(preview.id)?.status).toBe("stale")
  })

  it("refuses a renamed or closed view", () => {
    const renamed = fixture()
    renamed.view.file.path = "Renamed.md"
    const renamedController = new PreviewController({ viewFor: () => renamed.view } as never)
    const renamedPreview = renamedController.create(target, "replacement")
    expect(renamedController.approve(renamedPreview.id).ok).toBe(false)
    expect(renamed.replaceRange).not.toHaveBeenCalled()

    const closed = fixture()
    const closedController = new PreviewController({ viewFor: () => null } as never)
    const closedPreview = closedController.create(target, "replacement")
    expect(closedController.approve(closedPreview.id).ok).toBe(false)
    expect(closed.replaceRange).not.toHaveBeenCalled()
  })

  it("inserts at the captured cursor when there is no selection", () => {
    const cursorTarget = { ...target, selection: "", from: { line: 0, ch: 3 }, to: { line: 0, ch: 3 } }
    const { replaceRange, view } = fixture({
      getSelection: () => "",
      listSelections: () => [{ anchor: cursorTarget.from, head: cursorTarget.to }],
    })
    const controller = new PreviewController({ viewFor: () => view } as never)
    const preview = controller.create(cursorTarget, "insert")

    expect(controller.approve(preview.id)).toEqual({ ok: true })
    expect(replaceRange).toHaveBeenCalledWith("insert", cursorTarget.from, cursorTarget.to)
  })
})
