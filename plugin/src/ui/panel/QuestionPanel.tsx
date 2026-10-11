import { useRef, useState } from "react"

import { Button } from "@fathomark/design-system"

import type { PanelCommands, PendingQuestion } from "../state/panel-store"

interface QuestionPanelProps {
  readonly question: PendingQuestion
  readonly answerQuestion: NonNullable<PanelCommands["answerQuestion"]>
  readonly stop: () => void
}

export function QuestionPanel({ question, answerQuestion, stop }: QuestionPanelProps) {
  const [answer, setAnswer] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const submitting = useRef(false)

  function submit() {
    if (submitting.current || !answer.trim()) return
    submitting.current = true
    setSubmitted(true)
    const result = answerQuestion(question.questionId, answer.trim())
    if (!result.accepted) {
      submitting.current = false
      setSubmitted(false)
      setNotice(result.reason ?? "답변을 제출하지 못했습니다.")
    }
  }

  return (
    <section className="tw:flex tw:flex-col tw:gap-2 tw:px-3 tw:py-2">
      <strong>{question.question}</strong>
      {question.options?.map((option, index) => (
        <label key={`${index}-${option}`}>
          <input
            type="radio"
            name={question.questionId}
            value={option}
            checked={answer === option}
            disabled={submitted}
            onChange={() => setAnswer(option)}
          />
          {option}
        </label>
      ))}
      <textarea
        aria-label="보충 답변"
        rows={2}
        value={answer}
        disabled={submitted}
        onChange={(event) => setAnswer(event.target.value)}
        className="tw:rounded-fm-control tw:border tw:border-fm-line tw:bg-transparent tw:p-2"
      />
      {notice && <p role="alert">{notice}</p>}
      <div className="tw:flex tw:gap-2">
        <Button size="sm" disabled={submitted || !answer.trim()} onClick={submit}>
          답변 제출
        </Button>
        <Button size="sm" variant="outline" onClick={stop}>작업 중지</Button>
      </div>
    </section>
  )
}
