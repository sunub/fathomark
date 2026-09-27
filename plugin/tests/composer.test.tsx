import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Composer } from "../src/ui/panel/Composer"

afterEach(cleanup)

describe("composer", () => {
  it("composition Enter does not submit", () => {
    const ask = vi.fn()
    render(<Composer runState="idle" onAsk={ask} onStop={() => {}} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "한글" } })

    fireEvent.keyDown(textarea, { key: "Enter", keyCode: 229, isComposing: true })

    expect(ask).not.toHaveBeenCalled()
    expect((textarea as HTMLTextAreaElement).value).toBe("한글")
  })

  it("busy Enter preserves draft", () => {
    const ask = vi.fn()
    render(<Composer runState="streaming" onAsk={ask} onStop={() => {}} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "다음 질문" } })

    fireEvent.keyDown(textarea, { key: "Enter" })

    expect(ask).not.toHaveBeenCalled()
    expect((textarea as HTMLTextAreaElement).value).toBe("다음 질문")
  })

  it("rejected submit preserves draft", async () => {
    const ask = vi.fn(async () => ({ accepted: false, reason: "busy" }))
    render(<Composer runState="idle" onAsk={ask} onStop={() => {}} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "질문" } })

    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce())
    expect((textarea as HTMLTextAreaElement).value).toBe("질문")
  })
})
