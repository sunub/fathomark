import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StylePicker } from "../src/ui/panel/StylePicker"

afterEach(cleanup)

describe("style picker", () => {
  it("does not collect a selection before the explicit button", async () => {
    const select = vi.fn(async () => {})
    render(<StylePicker selectStyle={select} clearStyle={async () => {}} saveStyle={async () => {}} />)

    expect(select).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Use current selection as style" }))
    await vi.waitFor(() => expect(select).toHaveBeenCalledOnce())
  })

  it("runs save and clear actions and shows errors", async () => {
    const clear = vi.fn(async () => {})
    const save = vi.fn(async () => {
      throw new Error("save failed")
    })
    render(<StylePicker selectStyle={async () => {}} clearStyle={clear} saveStyle={save} />)

    fireEvent.click(screen.getByRole("button", { name: "Save style" }))
    await screen.findByText("save failed")
    fireEvent.click(screen.getByRole("button", { name: "Clear style" }))
    await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce())
  })
})
