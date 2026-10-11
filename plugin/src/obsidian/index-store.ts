import type { IndexStore, StoredIndex } from "../retrieval/vector-index"

/** The part of Obsidian's DataAdapter the store uses. The index lives in the plugin folder, not among notes. */
export interface PluginFiles {
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  write(path: string, data: string): Promise<void>
}

export function pluginFileStore(files: PluginFiles, path: string): IndexStore {
  return {
    async load() {
      if (!(await files.exists(path))) return null
      try {
        return JSON.parse(await files.read(path)) as StoredIndex
      } catch {
        // A half-written or hand-edited file is rebuilt rather than blocking semantic search for good.
        return null
      }
    },
    save: (index) => files.write(path, JSON.stringify(index)),
  }
}
