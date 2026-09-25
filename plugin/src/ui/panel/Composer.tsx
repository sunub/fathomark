/*
 * The composer. It is always present.
 *
 * Chat/Anatomy records this as the mistake that caused the panel to be
 * rebuilt: the streaming screen put a Stop button where the composer had been,
 * and the answer screen put an action row there, so one conversation looked
 * like three unrelated screens. The composer stays; Stop takes over the send
 * slot inside it.
 */

import { useState } from "react"

import { Button } from "@fathomark/design-system"
import { SendIcon, SquareIcon } from "lucide-react"

import type { RunState } from "../../harness/run-state"
import { sendSlot } from "../../harness/run-state"

export interface ComposerProps {
  readonly runState: RunState
  readonly onAsk: (question: string) => void
  readonly onStop: () => void
}

export function Composer({ runState, onAsk, onStop }: ComposerProps) {
  const [draft, setDraft] = useState("")
  const slot = sendSlot(runState)

  function submit() {
    const question = draft.trim()
    if (question.length === 0) return
    onAsk(question)
    setDraft("")
  }

  return (
    <div className="tw:flex tw:items-end tw:gap-2 tw:rounded-fm-panel tw:border tw:border-fm-line-strong tw:bg-fm-panel tw:p-2">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter makes a new line — the convention everywhere else.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        rows={2}
        placeholder="Ask about this note…"
        aria-label="Ask about this note"
        className="tw:min-h-10 tw:flex-1 tw:resize-none tw:bg-transparent tw:text-fm-body tw:text-fm-text tw:outline-none tw:placeholder:text-fm-text-faint"
      />
      {slot === "stop" ? (
        <Button variant="outline" size="icon-sm" onClick={onStop} aria-label="Stop">
          <SquareIcon />
        </Button>
      ) : (
        <Button size="icon-sm" onClick={submit} disabled={draft.trim().length === 0} aria-label="Send">
          <SendIcon />
        </Button>
      )}
    </div>
  )
}
