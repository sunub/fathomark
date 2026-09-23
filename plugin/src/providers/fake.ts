/*
 * A deterministic provider, for Phase 0 and for tests.
 *
 * ROADMAP Phase 0 asks the plugin to "run a fake streamed response through the
 * harness, cancel it, and unload without leaked resources" before any real
 * provider is chosen. That is what this is for: it makes the harness, the run
 * states, cancellation and the unload path testable while ROADMAP open decision
 * 4 is still open.
 *
 * It is deterministic on purpose. A fake that varies cannot tell you whether a
 * streaming bug is yours or the model's.
 */

import type {
  ModelEvent,
  ModelInfo,
  ModelProvider,
  ModelRequest,
  ProviderHealth,
} from "./types"

export interface FakeProviderOptions {
  /** Emitted one chunk at a time, in order. */
  readonly chunks?: readonly string[]
  /** Delay between chunks. Keep small in tests; a few hundred ms feels real by hand. */
  readonly chunkDelayMs?: number
  /** Simulates a cold model load, so the waiting state is exercised. */
  readonly firstEventDelayMs?: number
  readonly reachable?: boolean
}

const DEFAULT_CHUNKS = [
  "This is the deterministic fake provider. ",
  "It streams a fixed answer so the harness, the run states and cancellation ",
  "can be exercised before a real local model is selected.",
]

export class FakeModelProvider implements ModelProvider {
  readonly id = "fake"

  constructor(private readonly options: FakeProviderOptions = {}) {}

  async health(signal: AbortSignal): Promise<ProviderHealth> {
    signal.throwIfAborted()
    return this.options.reachable === false
      ? { reachable: false, detail: "Fake provider configured as unreachable." }
      : { reachable: true, detail: "Fake provider" }
  }

  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    signal.throwIfAborted()
    return [{ id: "fake", label: "Fake (deterministic)", supportsTools: true, contextLength: 16_000 }]
  }

  async *stream(_request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const chunks = this.options.chunks ?? DEFAULT_CHUNKS
    await sleep(this.options.firstEventDelayMs ?? 0, signal)

    for (const delta of chunks) {
      signal.throwIfAborted()
      yield { type: "text", delta }
      await sleep(this.options.chunkDelayMs ?? 0, signal)
    }

    signal.throwIfAborted()
    yield { type: "done", reason: "stop" }
  }
}

/**
 * Rejects on abort rather than resolving, so a cancelled run unwinds through
 * the same path a real provider's cancellation takes.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    signal.throwIfAborted()
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}
