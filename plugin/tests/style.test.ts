import { describe, expect, it, vi } from "vitest"

import { SelectedStyleStore, createSelectedStyle } from "../src/context/style"

describe("selected style", () => {
  it("rejects an empty selection", () => {
    expect(() => createSelectedStyle("   ")).toThrow(/empty/i)
  })

  it("allows 4096 UTF-8 bytes and rejects 4097", () => {
    expect(createSelectedStyle("a".repeat(4_096)).text).toHaveLength(4_096)
    expect(() => createSelectedStyle("a".repeat(4_097))).toThrow(/4096/)
  })

  it("keeps selection in memory until explicit persist and clears the next request", async () => {
    const save = vi.fn(async () => {})
    const store = new SelectedStyleStore(save)

    store.select("문체 예시")
    expect(save).not.toHaveBeenCalled()
    expect(store.get()?.text).toBe("문체 예시")

    await store.persist()
    expect(save).toHaveBeenCalledOnce()
    store.clear()
    expect(store.get()).toBeNull()
  })
})
