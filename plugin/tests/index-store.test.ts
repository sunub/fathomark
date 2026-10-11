import { describe, expect, it } from "vitest"

import { pluginFileStore } from "../src/obsidian/index-store"

function files(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    exists: async (path: string) => data.has(path),
    read: async (path: string) => data.get(path)!,
    write: async (path: string, content: string) => { data.set(path, content) },
  }
}

describe("plugin file index store", () => {
  it("round-trips an index through the plugin folder", async () => {
    const adapter = files()
    const store = pluginFileStore(adapter, ".obsidian/plugins/fathomark/vector-index.json")
    const index = { version: 1, model: "bge-m3", notes: [] }
    expect(await store.load()).toBeNull()
    await store.save(index)
    expect(await store.load()).toEqual(index)
  })

  it("treats a corrupt file as no index, so the next sync rebuilds it", async () => {
    const store = pluginFileStore(files({ "i.json": "{not json" }), "i.json")
    expect(await store.load()).toBeNull()
  })
})
