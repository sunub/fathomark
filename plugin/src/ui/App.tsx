import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription, Button } from "@fathomark/design-system";

import type { RunSnapshot } from "../harness/events";
import { isActive } from "../harness/run-state";
import { BudgetBar } from "./panel/BudgetBar";
import { Composer } from "./panel/Composer";
import { ContextSummary } from "./panel/ContextSummary";
import { Header } from "./panel/Header";
import { InsertionPreviewPanel } from "./panel/InsertionPreview";
import { QuestionPanel } from "./panel/QuestionPanel";
import { Sources } from "./panel/Sources";
import { StylePicker } from "./panel/StylePicker";
import { Conversation } from "./screens/Conversation";
import { INITIAL_PANEL_STATE, type PanelCommands, reduce } from "./state/panel-store";

export interface AppProps {
  readonly getSnapshot: () => RunSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly commands: PanelCommands;
  readonly modelLabel: string;
}

const PHASE_LABELS: Record<string, string> = {
  analyze: "요청 정리",
  target: "수정할 문단 찾기",
  readiness: "작성에 필요한 근거 확인",
  repair: "검증 결과에 따라 초안 보완",
  preview: "검증된 초안 확인",
  explore: "경험 근거 찾기",
  outline: "경험과 개요 선택",
  draft: "초안 작성",
  verify: "사실과 문체 확인",
};

export function App({ getSnapshot, subscribe, commands, modelLabel }: AppProps) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const state = useMemo(
    () => snapshot.events.reduce(reduce, { ...INITIAL_PANEL_STATE, runState: snapshot.state }),
    [snapshot],
  );
  const [researchTopic, setResearchTopic] = useState("");
  const [pastedSource, setPastedSource] = useState("");
  const [insertionPreview, setInsertionPreview] =
    useState<ReturnType<PanelCommands["previewAnswer"]>>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [insertionHandled, setInsertionHandled] = useState(false);
  const runId = snapshot.events.find((event) => event.type === "run_started")?.runId ?? null;

  useEffect(() => {
    setInsertionPreview(null);
    setInsertionHandled(false);
    setPreviewNotice(null);
  }, [runId]);

  const showPreview = (recapture?: boolean) => {
    const preview = commands.previewAnswer(recapture);
    setInsertionPreview(preview);
    setPreviewNotice(preview ? null : commands.previewBlockedReason(recapture));
  };

  return (
    <div className="tw:flex tw:h-full tw:flex-col">
      <Header runState={state.runState} elapsedMs={state.elapsedMs} />
      {state.phase && (
        <p role="status" className="tw:px-3 tw:text-fm-caption">
          {PHASE_LABELS[state.phase] ?? "작성 진행 중"}
        </p>
      )}

      <Conversation
        question={state.question}
        answer={state.answer}
        activity={state.activity}
        streaming={isActive(state.runState)}
      />

      <ContextSummary note={state.currentNote} />
      {state.pendingQuestion && commands.answerQuestion && (
        <QuestionPanel
          key={`${runId}-${state.pendingQuestion.questionId}`}
          question={state.pendingQuestion}
          answerQuestion={commands.answerQuestion}
          stop={commands.stop}
        />
      )}
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
      {state.verified && (
        <div className="tw:px-3 tw:text-fm-caption">
          <p>검증된 초안입니다. 적용 전에 원문과 수정 내용을 확인해주세요.</p>
          {state.verificationIssues.map((issue, index) => (
            <p key={`${index}-${issue}`}>{issue}</p>
          ))}
        </div>
      )}
      {state.answer && !insertionPreview && !insertionHandled && (
        <div className="tw:px-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => showPreview()}
          >
            Preview answer insertion
          </Button>
        </div>
      )}
      {previewNotice && !insertionPreview && (
        <div className="tw:px-3">
          <Alert>
            <AlertDescription>{previewNotice}</AlertDescription>
          </Alert>
        </div>
      )}
      {insertionPreview && (
        <InsertionPreviewPanel
          preview={insertionPreview}
          busy={isActive(state.runState)}
          approve={(id) => {
            const next = commands.approveInsertion(id);
            setInsertionHandled(next?.status === "applied");
            setInsertionPreview(next?.status === "applied" ? null : next);
          }}
          discard={(id) => {
            commands.discardInsertion(id);
            setInsertionPreview(null);
          }}
          recreate={() => showPreview(true)}
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
          onAsk={(question) => commands.ask(question, pastedSource.trim() || undefined)}
          onStop={commands.stop}
          draft={snapshot.draft ?? ""}
          onDraftChange={commands.setDraft}
        />

        <label className="tw:flex tw:flex-col tw:gap-1 tw:text-fm-caption">
          지원 공고 또는 문항 붙여넣기 (선택)
          <textarea
            aria-label="지원 공고 또는 문항 붙여넣기"
            rows={3}
            value={pastedSource}
            disabled={isActive(state.runState)}
            onChange={(event) => setPastedSource(event.target.value)}
            className="tw:rounded-fm-control tw:border tw:border-fm-line tw:bg-transparent tw:p-2"
          />
          <span>회사와 지원 조건을 확인하는 참고 자료로 사용합니다.</span>
        </label>

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
          {state.model ?? modelLabel}
        </div>
      </div>
    </div>
  );
}
