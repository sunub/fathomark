import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { InsertionPreview } from "../src/obsidian/insertion-preview"
import { InsertionPreviewPanel } from "../src/ui/panel/InsertionPreview"

afterEach(cleanup)

const preview: InsertionPreview = {
  id: "preview-1",
  targetId: "target-1",
  path: "Note.md",
  from: { line: 1, ch: 0 },
  to: { line: 1, ch: 3 },
  before: "old",
  after: "new",
  status: "pending",
}

describe("insertion preview panel", () => {
  it("shows path and before/after and exposes approve/discard", () => {
    const approve = vi.fn()
    const discard = vi.fn()
    render(<InsertionPreviewPanel preview={preview} busy={false} approve={approve} discard={discard} />)

    expect(screen.getByText("Note.md")).toBeTruthy()
    expect(screen.getByText("old")).toBeTruthy()
    expect(screen.getByText("new")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Approve insertion" }))
    fireEvent.click(screen.getByRole("button", { name: "Discard insertion" }))
    expect(approve).toHaveBeenCalledWith("preview-1")
    expect(discard).toHaveBeenCalledWith("preview-1")
  })

  it("does not allow apply while generation is active", () => {
    render(<InsertionPreviewPanel preview={preview} busy approve={() => {}} discard={() => {}} />)
    expect((screen.getByRole("button", { name: "Approve insertion" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("explains stale previews", () => {
    render(<InsertionPreviewPanel preview={{ ...preview, status: "stale" }} busy={false} approve={() => {}} discard={() => {}} />)
    expect(screen.getByText("문서가 바뀌었습니다. 미리보기를 다시 만들어 주세요.")).toBeTruthy()
  })
})
