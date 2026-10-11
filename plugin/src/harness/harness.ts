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

export type { RunInput } from "./run-input";

type RunOutcome = Extract<RunEvent, { type: "run_completed" }>["outcome"];

export interface HarnessOptions {
  readonly provider: ModelProvider;
  readonly tools: ToolRegistry;
  readonly limits: BudgetLimits;
  readonly permissions: PermissionContext;
  readonly model: string;
  readonly counter: RequestCounter;
  readonly runTimeoutMs?: number;
}

export class AgentHarness {
  private state: RunState = "idle";
  private controller: AbortController | null = null;
  private readonly listeners = new Set<RunEventListener>();
  private runCounter = 0;

  constructor(private readonly options: HarnessOptions) { }

  currentState(): RunState {
    return this.state;
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
    const started = Date.now();
    const timeoutMs = this.options.runTimeoutMs ?? 120_000;
    const timeout = setTimeout(() => {
      controller.abort(new DOMException(`The run timed out after ${timeoutMs}ms.`, "TimeoutError"));
    }, timeoutMs);

    try {
      this.emit({
        type: "run_started",
        runId,
        question: input.question,
        currentNote: input.packet.currentNote,
      });
      this.go(runId, "preparing_context");
      this.emit({ type: "budget", runId, usage: emptyUsage(this.options.limits) });

      let outcome: RunOutcome | null = null;
      const loop = runAgentLoop(
        runId,
        input,
        {
          provider: this.options.provider,
          model: this.options.model,
          tools: this.options.tools,
          limits: this.options.limits,
          counter: this.options.counter,
          permissions: () => this.options.permissions,
        },
        controller.signal,
      );

      for await (const event of loop) {
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

      // preparing_answer is reachable only from streaming or executing_tool, so
      // a run that produced no prose still passes through streaming.
      if (this.currentState() === "waiting_for_model") this.go(runId, "streaming");
      this.go(runId, "preparing_answer");
      this.emit({ type: "usage", runId, elapsedMs: Date.now() - started, tokens: 0 });
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
      clearTimeout(timeout);
      this.controller = null;
    }
  }

  /**
   * Run state follows the loop's events. Each guard is a transition that
   * run-state.ts would otherwise refuse, not a defensive check.
   */
  private advance(runId: RunId, event: RunEvent): void {
    switch (event.type) {
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
