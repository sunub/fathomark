import type { ConversationTurn } from "../context/packet"
import type { EditorTarget } from "../context/insertion"
import type { RunEvent, RunSnapshot } from "./events"
import type { AgentHarness } from "./harness"
import type { RunInput } from "./harness"
import type { PreviousCareerResult } from "./run-input"

const MAX_COMPLETED_CONVERSATIONS = 10

export class RunSession {
  private snapshot: RunSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly completedHistory: ConversationTurn[] = []
  private readonly unsubscribeHarness: () => void
  private disposed = false
  private request: { input: RunInput; target: EditorTarget | null } | null = null
  private verified: Extract<RunEvent, { type: "verified_draft" }> | null = null
  private applied = false

  constructor(harness: AgentHarness) {
    this.snapshot = { version: 0, state: harness.currentState(), events: [], draft: "" }
    this.unsubscribeHarness = harness.subscribe((event) => this.receive(event))
  }

  getSnapshot(): RunSnapshot {
    return this.snapshot
  }

  getVerifiedDraft(): Extract<RunEvent, { type: "verified_draft" }> | null {
    return this.snapshot.state === "complete" ? this.verified : null
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  history(): readonly ConversationTurn[] {
    return this.completedHistory
  }

  setDraft(draft: string): void {
    if (this.disposed || draft === this.snapshot.draft) return
    this.snapshot = { ...this.snapshot, version: this.snapshot.version + 1, draft }
    this.notify()
  }

  rememberRequest(input: RunInput, target: EditorTarget | null): void {
    this.request = { input, target }
  }

  lastRequest(): { input: RunInput; target: EditorTarget | null } | null {
    return this.request
  }

  /** The verified draft went into the note, so a follow-up must revise the note, not this draft. */
  markApplied(): void {
    this.applied = true
  }

  /**
   * What a follow-up career request builds on. A completed run passes only the sources its verified
   * draft cited, so evidence does not pile up across requests; an unfinished one passes all it
   * gathered, user answers included. The draft goes along until it is applied to the note.
   */
  followUp(): PreviousCareerResult | null {
    if (this.request?.input.mode !== "career") return null
    const completed = this.getVerifiedDraft()
    const cited = completed ? new Set([...completed.text.matchAll(/\[\[(S\d+)\]\]/g)].map((match) => match[1])) : null
    const evidence = this.snapshot.events.flatMap((event) => (event.type === "evidence" && (!cited || cited.has(event.sourceId)) ? [event] : []))
      .sort((left, right) => Number(left.sourceId.slice(1)) - Number(right.sourceId.slice(1)))
      .map((event) => event.reference)
    const draft = completed && !this.applied ? completed : null
    if (!evidence.length && !draft) return null
    return draft ? { evidence, draft: { text: draft.text, target: draft.target } } : { evidence }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeHarness()
    this.listeners.clear()
  }

  private receive(event: RunEvent): void {
    if (this.disposed) return
    if (event.type === "run_started") {
      this.verified = null
      this.applied = false
    }
    if (event.type === "verified_draft") this.verified = event

    let events = event.type === "run_started" ? [event] : [...this.snapshot.events, event]
    const previous = events.at(-2)
    if (event.type === "text" && previous?.type === "text" && previous.runId === event.runId) {
      events = [
        ...events.slice(0, -2),
        { ...event, delta: previous.delta + event.delta },
      ]
    }

    const state = event.type === "state" ? event.state : this.snapshot.state
    this.snapshot = { ...this.snapshot, version: this.snapshot.version + 1, state, events }

    if (event.type === "state" && event.state === "complete") this.rememberCompletedRun()
    this.notify()
  }

  private notify(): void {
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
