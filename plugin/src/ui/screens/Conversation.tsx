/*
 * The transcript.
 *
 * Two shapes from Copilot/Components are load-bearing here: the answer is a
 * `ghost` bubble rather than a tinted one, because prose in a bubble at 400px
 * wrecks the characters-per-line; and tool activity is a Marker row, kept out
 * of the prose entirely.
 */

import { Bubble, BubbleContent, Marker, MarkerContent, Spinner } from "@fathomark/design-system"

import type { ToolActivity } from "../state/panel-store"

export interface ConversationProps {
  readonly question: string | null
  readonly answer: string
  readonly activity: readonly ToolActivity[]
  readonly streaming: boolean
}

export function Conversation({ question, answer, activity, streaming }: ConversationProps) {
  if (question === null && answer.length === 0 && activity.length === 0) {
    return (
      <div className="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:px-6 tw:text-center tw:text-fm-caption tw:text-fm-text-muted">
        Ask about the note you have open. Answers cite the notes they came from.
      </div>
    )
  }

  return (
    <div className="tw:flex tw:flex-1 tw:flex-col tw:gap-3 tw:overflow-y-auto tw:px-3 tw:py-2">
      {question !== null && (
        <Bubble className="tw:self-end">
          <BubbleContent>{question}</BubbleContent>
        </Bubble>
      )}

      {activity.map((item) => (
        <Marker key={item.callId}>
          <MarkerContent>
            <span className="tw:font-fm-mono tw:text-fm-caption">
              {item.tool}
              {item.detail && ` · ${item.detail}`}
            </span>
          </MarkerContent>
        </Marker>
      ))}

      {answer.length > 0 && (
        <div className="tw:text-fm-body tw:whitespace-pre-wrap tw:text-fm-text">
          {answer}
          {/* The streaming caret is the agent's own colour. */}
          {streaming && <span className="tw:ml-0.5 tw:inline-block tw:w-1.5 tw:bg-fm-brand">&nbsp;</span>}
        </div>
      )}

      {/* A spinner only ever appears beside a named activity, never alone. */}
      {streaming && answer.length === 0 && (
        <div className="tw:flex tw:items-center tw:gap-2 tw:text-fm-caption tw:text-fm-text-muted">
          <Spinner /> Waiting for the model…
        </div>
      )}
    </div>
  )
}
