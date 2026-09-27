/*
 * The panel.
 *
 * Chat/Anatomy: every main screen has the same three parts in the same
 * order — header, body, bottom — and the bottom is one component with four
 * slots: the state row, the budget bar, the composer, and the model line.
 */

import { useMemo, useState, useSyncExternalStore } from "react"

import { Alert, AlertDescription, Button } from "@fathomark/design-system"

import type { RunSnapshot } from "../harness/events"
import { isActive } from "../harness/run-state"
import { BudgetBar } from "./panel/BudgetBar"
import { Composer } from "./panel/Composer"
import { ContextSummary } from "./panel/ContextSummary"
import { Header } from "./panel/Header"
import { InsertionPreviewPanel } from "./panel/InsertionPreview"
import { Sources } from "./panel/Sources"
import { StylePicker } from "./panel/StylePicker"
import { Conversation } from "./screens/Conversation"
import { INITIAL_PANEL_STATE, type PanelCommands, reduce } from "./state/panel-store"

export interface AppProps {
  readonly getSnapshot: () => RunSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly commands: PanelCommands
  /** For the model status line. */
  readonly modelLabel: string
}

export function App({ getSnapshot, subscribe, commands, modelLabel }: AppProps) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const state = useMemo(
    () => snapshot.events.reduce(reduce, { ...INITIAL_PANEL_STATE, runState: snapshot.state }),
    [snapshot]
  )
  const [researchTopic, setResearchTopic] = useState("")
  const [insertionPreview, setInsertionPreview] = useState<ReturnType<PanelCommands["previewAnswer"]>>(null)

  return (
    <div className="tw:flex tw:h-full tw:flex-col">
      <Header runState={state.runState} elapsedMs={state.elapsedMs} />

      <Conversation
        question={state.question}
        answer={state.answer}
        activity={state.activity}
        streaming={isActive(state.runState)}
      />

      <ContextSummary note={state.currentNote} />
      <Sources
        answer={state.answer}
        evidence={state.evidence}
        conflicts={state.conflicts}
        openSource={commands.openSource}
      />
      <StylePicker
        selectStyle={commands.selectStyle}
        clearStyle={commands.clearStyle}
        saveStyle={commands.saveStyle}
      />
      {state.answer && !insertionPreview && (
        <div className="tw:px-3">
          <Button size="sm" variant="outline" onClick={() => setInsertionPreview(commands.previewAnswer())}>
            Preview answer insertion
          </Button>
        </div>
      )}
      {insertionPreview && (
        <InsertionPreviewPanel
          preview={insertionPreview}
          busy={isActive(state.runState)}
          approve={(id) => setInsertionPreview(commands.approveInsertion(id))}
          discard={(id) => setInsertionPreview(commands.discardInsertion(id))}
        />
      )}

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
          onAsk={commands.ask}
          onStop={commands.stop}
        />

        <label className="tw:flex tw:flex-col tw:gap-1 tw:text-fm-caption tw:text-fm-text-muted">
          Public Wikipedia topic
          <input
            aria-label="Public Wikipedia topic"
            value={researchTopic}
            onChange={(event) => setResearchTopic(event.target.value)}
            onBlur={() => commands.setResearchTopic(researchTopic, "en")}
            className="tw:rounded-fm-control tw:border tw:border-fm-line tw:bg-transparent tw:px-2 tw:py-1"
          />
          <span>Only this exact text may be sent to Wikipedia.</span>
        </label>

        <div className="tw:flex tw:items-center tw:gap-1.5 tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">
          <span className="tw:size-1.5 tw:rounded-full tw:bg-fm-ok" aria-hidden />
          {modelLabel}
        </div>
      </div>
    </div>
  )
}
