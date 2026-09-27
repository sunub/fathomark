import type { ConversationTurn } from "../context/packet"
import type { RunEvent, RunSnapshot } from "./events"
import type { AgentHarness } from "./harness"

const MAX_COMPLETED_CONVERSATIONS = 10

export class RunSession {
  private snapshot: RunSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly completedHistory: ConversationTurn[] = []
  private readonly unsubscribeHarness: () => void
  private disposed = false

  constructor(harness: AgentHarness) {
    this.snapshot = { version: 0, state: harness.currentState(), events: [] }
    this.unsubscribeHarness = harness.subscribe((event) => this.receive(event))
  }

  getSnapshot(): RunSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  history(): readonly ConversationTurn[] {
    return this.completedHistory
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeHarness()
    this.listeners.clear()
  }

  private receive(event: RunEvent): void {
    if (this.disposed) return

    let events = event.type === "run_started" ? [event] : [...this.snapshot.events, event]
    const previous = events.at(-2)
    if (event.type === "text" && previous?.type === "text" && previous.runId === event.runId) {
      events = [
        ...events.slice(0, -2),
        { ...event, delta: previous.delta + event.delta },
      ]
    }

    const state = event.type === "state" ? event.state : this.snapshot.state
    this.snapshot = { version: this.snapshot.version + 1, state, events }

    if (event.type === "state" && event.state === "complete") this.rememberCompletedRun()
    for (const listener of this.listeners) listener()
  }

  private rememberCompletedRun(): void {
    const started = this.snapshot.events.find((event) => event.type === "run_started")
    if (started?.type !== "run_started") return
    const answer = this.snapshot.events
      .filter((event) => event.type === "text")
      .map((event) => event.delta)
      .join("")
    this.completedHistory.push(
      { role: "user", text: started.question },
      { role: "assistant", text: answer }
    )
    const maxTurns = MAX_COMPLETED_CONVERSATIONS * 2
    if (this.completedHistory.length > maxTurns) {
      this.completedHistory.splice(0, this.completedHistory.length - maxTurns)
    }
  }
}
