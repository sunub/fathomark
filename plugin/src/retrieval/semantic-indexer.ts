import type { Embedder } from "../providers/ollama-embedder"
import type { EvidenceJudge } from "../providers/ollama-judge"
import type { SemanticBackend } from "../tools/hybrid-search"
import type { NoteSource, VectorIndex } from "./vector-index"

/**
 * Keeps the embedding index in step with the vault and decides when search may use it.
 * Any failure leaves search on keywords: a user without the embedding model loses nothing.
 */
export class SemanticIndexer {
  private loaded = false
  private running: Promise<void> | null = null
  /** Why the last refresh stopped, for the settings tab. Null after a successful refresh. */
  lastError: string | null = null

  constructor(
    private readonly index: VectorIndex,
    private readonly embedder: Embedder,
    /** Read on every call, so the setting applies without a restart. */
    private readonly enabled: () => boolean,
    /** Reads each candidate note to tell the writer's own experience from a mention. */
    private readonly judge?: () => EvidenceJudge,
  ) {}

  backend(): SemanticBackend | undefined {
    if (!this.enabled() || this.index.noteCount === 0) return undefined
    return this.judge ? { index: this.index, embedder: this.embedder, judge: this.judge() } : { index: this.index, embedder: this.embedder }
  }

  /** Embeds notes that changed since the last refresh. Concurrent calls share the one in flight. */
  refresh(source: NoteSource, signal: AbortSignal): Promise<void> {
    if (!this.enabled()) return Promise.resolve()
    this.running ??= this.sync(source, signal).finally(() => { this.running = null })
    return this.running
  }

  private async sync(source: NoteSource, signal: AbortSignal): Promise<void> {
    try {
      if (!this.loaded) {
        await this.index.load()
        this.loaded = true
      }
      await this.index.sync(source, signal)
      this.lastError = null
    } catch (error) {
      // Unload aborts the refresh; that is not a failure to report.
      if (signal.aborted) return
      this.lastError = error instanceof Error ? error.message : String(error)
    }
  }
}
