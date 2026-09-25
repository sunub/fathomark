/*
 * The panel.
 *
 * Chat/Anatomy: every main screen has the same three parts in the same
 * order — header, body, bottom — and the bottom is one component with four
 * slots: the state row, the budget bar, the composer, and the model line.
 */

import { useEffect, useReducer, useState } from "react"

import { Alert, AlertDescription } from "@fathomark/design-system"

import type { RunEvent } from "../harness/events"
import { isActive } from "../harness/run-state"
import { BudgetBar } from "./panel/BudgetBar"
import { Composer } from "./panel/Composer"
import { Header } from "./panel/Header"
import { Conversation } from "./screens/Conversation"
import { INITIAL_PANEL_STATE, type PanelCommands, reduce } from "./state/panel-store"

export interface AppProps {
  /** Returns an unsubscribe function, which the effect below is required to call. */
  readonly subscribe: (listener: (event: RunEvent) => void) => () => void
  readonly commands: PanelCommands
  /** For the model status line. */
  readonly modelLabel: string
}

export function App({ subscribe, commands, modelLabel }: AppProps) {
  const [state, dispatch] = useReducer(reduce, INITIAL_PANEL_STATE)
  const [question, setQuestion] = useState<string | null>(null)

  useEffect(() => subscribe(dispatch), [subscribe])

  return (
    <div className="tw:flex tw:h-full tw:flex-col">
      <Header runState={state.runState} elapsedMs={state.elapsedMs} />

      <Conversation
        question={question}
        answer={state.answer}
        activity={state.activity}
        streaming={isActive(state.runState)}
      />

      <div className="tw:flex tw:shrink-0 tw:flex-col tw:gap-2 tw:px-3 tw:pt-2.5 tw:pb-3">
        {/*
         * A failure is a persistent, actionable row, not a toast that vanishes,
         * and it never disables the composer below it. PRODUCT.md: a terminal
         * outcome returns to an input-ready state.
         */}
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {state.usage && <BudgetBar usage={state.usage} />}

        <Composer
          runState={state.runState}
          onAsk={(text) => {
            setQuestion(text)
            commands.ask(text)
          }}
          onStop={commands.stop}
        />

        <div className="tw:flex tw:items-center tw:gap-1.5 tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">
          <span className="tw:size-1.5 tw:rounded-full tw:bg-fm-ok" aria-hidden />
          {modelLabel}
        </div>
      </div>
    </div>
  )
}
