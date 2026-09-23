/*
 * The Agent Harness.
 *
 * It owns the run: state transitions, cancellation, the tool allowlist, call
 * limits, budget, and the translation of everything into RunEvent. The model
 * loop itself is the replaceable part.
 *
 * LangChain is not imported here yet, and that is intentional rather than
 * unfinished. ROADMAP Phase 0 wants a fake streamed response running through
 * these states first, and keeping the seam empty for one phase gives a
 * bundle-size baseline to compare against once `createAgent` arrives — see the
 * budget check in build.mjs. When it lands, it lands in THIS file and nowhere
 * else: .dependency-cruiser.cjs enforces that.
 */

import type { ContextPacket } from "../context/packet"
import type { ModelProvider, ModelRequest } from "../providers/types"
import type { ToolRegistry } from "../tools/registry"
import { type BudgetLimits, emptyUsage } from "./budget"
import type { RunEvent, RunEventListener, RunId } from "./events"
import { CallLimiter, type PermissionContext } from "./policy"
import { type RunState, isActive, transition } from "./run-state"

export interface HarnessOptions {
  readonly provider: ModelProvider
  readonly tools: ToolRegistry
  readonly limits: BudgetLimits
  readonly permissions: PermissionContext
  readonly model: string
}

export interface RunInput {
  readonly question: string
  readonly packet: ContextPacket
}

export class AgentHarness {
  private state: RunState = "idle"
  private controller: AbortController | null = null
  private readonly listeners = new Set<RunEventListener>()
  private runCounter = 0

  constructor(private readonly options: HarnessOptions) {}

  currentState(): RunState {
    return this.state
  }

  subscribe(listener: RunEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Cancels the active run. Safe to call when nothing is running, which is what
   * makes it safe to call from onunload unconditionally.
   */
  cancel(): void {
    this.controller?.abort(new DOMException("Cancelled by the user.", "AbortError"))
  }

  /** Releases every listener and stops any run. Called from the plugin's onunload. */
  dispose(): void {
    this.cancel()
    this.listeners.clear()
  }

  async run(input: RunInput): Promise<void> {
    if (isActive(this.state)) {
      throw new Error("A run is already active. Cancel it before starting another.")
    }

    const runId = `run-${(++this.runCounter).toString(16).padStart(4, "0")}` as RunId
    const controller = new AbortController()
    this.controller = controller
    const limiter = new CallLimiter()
    const started = Date.now()

    try {
      this.go(runId, "preparing_context")
      this.emit({ type: "budget", runId, usage: emptyUsage(this.options.limits) })

      const request: ModelRequest = {
        model: this.options.model,
        messages: [
          { role: "system", content: input.packet.systemInstructions },
          { role: "user", content: input.question },
        ],
        tools: [],
        maxOutputTokens: this.options.limits.outputReserve,
      }

      this.go(runId, "waiting_for_model")

      let sawOutput = false
      for await (const event of this.options.provider.stream(request, controller.signal)) {
        switch (event.type) {
          case "text":
            if (!sawOutput) {
              sawOutput = true
              this.go(runId, "streaming")
            }
            this.emit({ type: "text", runId, delta: event.delta })
            break

          case "tool_call": {
            /*
             * The model proposed a name. Two refusals happen before anything
             * runs, and neither consults the model: is this tool registered at
             * all, and has this run already called it too often?
             */
            const tool = this.options.tools.get(event.call.name)
            if (!tool) {
              this.emit({
                type: "tool_failed",
                runId,
                callId: event.call.callId,
                reason: `${event.call.name} is not a Fathomark tool.`,
              })
              break
            }
            const refusal = limiter.check(tool.name)
            if (refusal) {
              this.emit({ type: "tool_failed", runId, callId: event.call.callId, reason: refusal })
              break
            }
            this.emit({
              type: "tool_call",
              runId,
              callId: event.call.callId,
              tool: tool.name,
              args: event.call.args,
            })
            break
          }

          case "done":
            this.go(runId, isActive(this.state) && this.state !== "streaming" ? "streaming" : this.state)
            break
        }
      }

      this.go(runId, "preparing_answer")
      this.emit({ type: "usage", runId, elapsedMs: Date.now() - started, tokens: 0 })
      this.go(runId, "complete")
    } catch (error) {
      /*
       * Cancellation is an outcome, not a failure. Conflating them is how a
       * panel ends up showing a red error for a Stop the user pressed.
       */
      if (controller.signal.aborted) {
        this.go(runId, "cancelled")
      } else {
        this.emit({
          type: "error",
          runId,
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        })
        this.go(runId, "failed")
      }
    } finally {
      this.controller = null
    }
  }

  private go(runId: RunId, next: RunState): void {
    if (next === this.state) return
    this.state = transition(this.state, next)
    this.emit({ type: "state", runId, state: this.state })
  }

  private emit(event: RunEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
