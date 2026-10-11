import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { QuestionPanel } from "../src/ui/panel/QuestionPanel"

afterEach(cleanup)

const question = { questionId: "q1", question: "어느 문단을 수정할까요?", options: ["첫 문단", "둘째 문단"] }

describe("question panel", () => {
  it("submits the selected option once and retains stop while waiting", async () => {
    const answer = vi.fn(() => ({ accepted: true }))
    const stop = vi.fn()
    render(<QuestionPanel question={question} answerQuestion={answer} stop={stop} />)
    fireEvent.click(screen.getByRole("radio", { name: "둘째 문단" }))
    fireEvent.click(screen.getByRole("button", { name: "답변 제출" }))
    await vi.waitFor(() => expect(answer).toHaveBeenCalledWith("q1", "둘째 문단"))
    expect((screen.getByRole("button", { name: "답변 제출" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "작업 중지" }))
    expect(stop).toHaveBeenCalledOnce()
  })

  it("keeps a rejected answer editable and shows the rejection", async () => {
    const answer = vi.fn(() => ({ accepted: false, reason: "질문이 만료되었습니다." }))
    render(<QuestionPanel question={question} answerQuestion={answer} stop={() => {}} />)
    fireEvent.change(screen.getByRole("textbox", { name: "보충 답변" }), { target: { value: "직접 지정" } })
    fireEvent.click(screen.getByRole("button", { name: "답변 제출" }))
    await vi.waitFor(() => expect(screen.getByText("질문이 만료되었습니다.")).toBeTruthy())
    expect((screen.getByRole("button", { name: "답변 제출" }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("직접 지정")
  })
})
