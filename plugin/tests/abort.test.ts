import { describe, expect, it } from "vitest"

import { raceWithSignal } from "../src/harness/abort"

describe("raceWithSignal", () => {
  it("does not leave the abandoned promise's rejection unhandled when already aborted", async () => {
    const unhandled: unknown[] = []
    const listener = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", listener)
    try {
      const controller = new AbortController()
      controller.abort(new DOMException("Cancelled by the user.", "AbortError"))
      // A provider stream that was already started when the signal fired.
      const started = Promise.reject(new Error("provider saw the abort"))

      expect(() => raceWithSignal(started, controller.signal)).toThrow("Cancelled by the user.")

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", listener)
    }
  })
})
