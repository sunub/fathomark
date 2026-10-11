/*
 * The Agent Harness.
 *
 * It owns the run: state transitions, cancellation, timeout, and the single
 * error boundary. The model loop (runAgentLoop) is the replaceable part: it only
 * yields RunEvent, and this class turns those events into run states.
 *
 * LangChain is not imported here yet, and that is intentional rather than
 * unfinished. Keeping the loop an event source gives a behaviour and bundle-size
 * baseline to compare `createAgent` against — see the budget check in build.mjs.
 * When it lands it replaces the loop's internals and this class stays as it is;
 * .dependency-cruiser.cjs keeps it inside src/harness.
 */

import type { ModelProvider, RequestCounter } from "../providers/types";
import type { ToolRegistry } from "../tools/registry";
import { type BudgetLimits, emptyUsage } from "./budget";
import type { RunEvent, RunEventListener, RunId } from "./events";
import { runAgentLoop } from "./agent-loop";
import type { PermissionContext } from "./policy";
import type { RunInput } from "./run-input";
import { type RunState, isActive, transition } from "./run-state";
import { runCareerWorkflow } from "../workflow/career-graph";
import { CAREER_LIMITS, type UserQuestion, type UserReply } from "../workflow/state";
import { raceWithSignal } from "./abort";

export type { RunInput } from "./run-input";

type RunOutcome = Extract<RunEvent, { type: "run_completed" }>["outcome"];

export interface HarnessOptions {
  readonly provider: ModelProvider;
  readonly tools: ToolRegistry;
  readonly limits: BudgetLimits;
  /** Read on every request, so a changed setting applies without a new harness. */
  readonly permissions: () => PermissionContext;
  readonly model: string;
  readonly counter: RequestCounter;
  readonly runTimeoutMs?: number;
  readonly resolveRuntime?: (input: RunInput) => Pick<HarnessOptions, "provider" | "tools" | "model" | "counter">;
}

export class AgentHarness {
  private state: RunState = "idle";
  private controller: AbortController | null = null;
  private readonly listeners = new Set<RunEventListener>();
  private runCounter = 0;
  private questionCounter = 0;
  private pendingAnswer: { questionId: string; options?: readonly string[]; resolve: (reply: UserReply) => void } | null = null;
  private pauseTimer: (() => void) | null = null;
  private resumeTimer: (() => void) | null = null;

  constructor(private readonly options: HarnessOptions) { }

  currentState(): RunState {
    return this.state;
  }

  answerQuestion(questionId: string, answer: string): { accepted: boolean; reason?: string } {
    const pending = this.pendingAnswer;
    if (!pending || pending.questionId !== questionId || this.state !== "waiting_for_user" || this.controller?.signal.aborted) {
      return { accepted: false, reason: "이 질문은 더 이상 답변을 기다리지 않습니다." };
    }
    const value = answer.trim();
    if (!value || new TextEncoder().encode(value).length > CAREER_LIMITS.answerBytes) return { accepted: false, reason: "답변을 입력하고 길이를 줄여주세요." };
    if (pending.options && !pending.options.includes(value)) return { accepted: false, reason: "제시된 선택지 중 하나를 선택해주세요." };
    this.pendingAnswer = null;
    pending.resolve({ questionId, answerId: `${questionId}:answer`, answer: value });
    return { accepted: true };
  }

  private async waitForUser(runId: RunId, request: UserQuestion, signal: AbortSignal): Promise<UserReply> {
    signal.throwIfAborted();
    const questionId = `${runId}:question-${++this.questionCounter}`;
    const answer = new Promise<UserReply>(resolve => {
      this.pendingAnswer = { questionId, resolve, ...(request.options ? { options: request.options } : {}) };
    });
    this.pauseTimer?.();
    this.go(runId, "waiting_for_user");
    this.emit({ type: "question_requested", runId, questionId, ...request });
    try {
      const reply = await raceWithSignal(answer, signal);
      signal.throwIfAborted();
      this.emit({ type: "question_answered", runId, ...reply });
      this.go(runId, "waiting_for_model");
      this.resumeTimer?.();
      return reply;
    } finally { this.pendingAnswer = null; }
  }

  subscribe(listener: RunEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Cancels the active run. Safe to call when nothing is running, which is what
   * makes it safe to call from onunload unconditionally.
   */
  cancel(): void {
    this.controller?.abort(new DOMException("Cancelled by the user.", "AbortError"));
  }

  /** Releases every listener and stops any run. Called from the plugin's onunload. */
  dispose(): void {
    this.cancel();
    this.listeners.clear();
  }

  async run(input: RunInput): Promise<void> {
    if (isActive(this.state)) {
      throw new Error("A run is already active. Cancel it before starting another.");
    }

    const runId = `run-${(++this.runCounter).toString(16).padStart(4, "0")}` as RunId;
    const controller = new AbortController();
    this.controller = controller;
    const timeoutMs = this.options.runTimeoutMs ?? 120_000;
    let remaining = timeoutMs;
    let activeStarted = Date.now();
    let activeElapsed = 0;
    let tokens = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const pause = () => {
      if (timeout === null) return;
      clearTimeout(timeout);
      timeout = null;
      const elapsed = Date.now() - activeStarted;
      activeElapsed += elapsed;
      remaining -= elapsed;
    };
    const resume = () => {
      if (timeout !== null || controller.signal.aborted) return;
      activeStarted = Date.now();
      timeout = setTimeout(() => controller.abort(new DOMException(`The run timed out after ${timeoutMs}ms.`, "TimeoutError")), Math.max(0, remaining));
    };
    this.pauseTimer = pause;
    this.resumeTimer = resume;
    resume();

    try {
      let runtime: Pick<HarnessOptions, "provider" | "tools" | "model" | "counter">;
      try {
        runtime = this.options.resolveRuntime?.(input) ?? this.options;
      } catch (error) {
        this.emit({ type: "run_started", runId, question: input.question, currentNote: input.packet.currentNote, model: this.options.model });
        this.go(runId, "preparing_context");
        throw error;
      }
      this.emit({
        type: "run_started",
        runId,
        question: input.question,
        currentNote: input.packet.currentNote,
        model: runtime.model,
      });
      this.go(runId, "preparing_context");
      this.emit({ type: "budget", runId, usage: emptyUsage(this.options.limits) });

      let outcome: RunOutcome | null = null;
      const options = {
        provider: runtime.provider,
        model: runtime.model,
        tools: runtime.tools,
        limits: this.options.limits,
        counter: runtime.counter,
        permissions: this.options.permissions,
      };
      const loop = input.mode === "career" ? runCareerWorkflow(runId, input, {
        ...options,
        waitForUser: request => this.waitForUser(runId, request, controller.signal),
        reportBudget: (promptTokens, estimated) => this.emit({ type: "budget", runId, usage: { ...emptyUsage(this.options.limits), instructions: promptTokens, estimated } }),
        reportUsage: value => { tokens = value; },
      }, controller.signal) : runAgentLoop(
        runId,
        input,
        options,
        controller.signal,
      );

      for await (const event of loop) {
        controller.signal.throwIfAborted();
        // The loop reports how it ended; the harness turns that into a state,
        // so the UI and RunSession keep reading one completion signal.
        if (event.type === "run_completed") {
          outcome = event.outcome;
          continue;
        }
        this.advance(runId, event);
        this.emit(event);
      }

      if (outcome === null) {
        throw new Error("The agent loop ended without a completion.");
      }
      controller.signal.throwIfAborted();

      // preparing_answer is reachable only from streaming or executing_tool, so
      // a run that produced no prose still passes through streaming.
      if (this.currentState() === "waiting_for_model") this.go(runId, "streaming");
      this.go(runId, "preparing_answer");
      pause();
      this.emit({ type: "usage", runId, elapsedMs: activeElapsed, tokens });
      this.go(runId, outcome);
    } catch (error) {
      /*
       * Cancellation is an outcome, not a failure. Conflating them is how a
       * panel ends up showing a red error for a Stop the user pressed.
       */
      if (
        controller.signal.reason instanceof DOMException &&
        controller.signal.reason.name === "TimeoutError"
      ) {
        this.emit({
          type: "error",
          runId,
          message: controller.signal.reason.message,
          recoverable: true,
        });
        this.go(runId, "failed");
      } else if (controller.signal.aborted) {
        this.go(runId, "cancelled");
      } else {
        this.emit({
          type: "error",
          runId,
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
        this.go(runId, "failed");
      }
    } finally {
      pause();
      this.pendingAnswer = null;
      this.pauseTimer = null;
      this.resumeTimer = null;
      this.controller = null;
    }
  }

  /**
   * Run state follows the loop's events. Each guard is a transition that
   * run-state.ts would otherwise refuse, not a defensive check.
   */
  private advance(runId: RunId, event: RunEvent): void {
    switch (event.type) {
      case "workflow_phase":
        if (this.state !== "waiting_for_model") this.go(runId, "waiting_for_model");
        break;
      case "budget":
        if (this.state === "preparing_context") this.go(runId, "waiting_for_model");
        break;
      case "text":
        // After a tool call began, prose does not move the state backwards.
        if (this.state === "waiting_for_model") this.go(runId, "streaming");
        break;
      case "tool_call":
        // waiting_for_model cannot go straight to executing_tool.
        if (this.state === "waiting_for_model") this.go(runId, "streaming");
        this.go(runId, "executing_tool");
        break;
      case "tool_result":
      case "tool_failed":
        if (this.state === "executing_tool") this.go(runId, "waiting_for_model");
        break;
    }
  }

  private go(runId: RunId, next: RunState): void {
    if (next === this.state) return;
    this.state = transition(this.state, next);
    this.emit({ type: "state", runId, state: this.state });
  }

  private emit(event: RunEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
