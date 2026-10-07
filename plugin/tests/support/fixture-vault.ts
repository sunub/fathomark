import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import type { VaultReader } from "../../src/tools/vault-search"

function listMarkdown(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listMarkdown(join(dir, entry.name))
      : entry.name.endsWith(".md")
        ? [join(dir, entry.name)]
        : []
  )
}

/** Reads a directory of markdown notes as a VaultReader. Paths are vault-relative, like Obsidian's. */
export function loadFixtureVault(root: string): VaultReader {
  const files = listMarkdown(root)
    .map((file) => relative(root, file).normalize("NFC"))
    .sort()
  return {
    listNotes: () =>
      files.map((path) => ({
        path,
        title: path.split("/").pop()!.replace(/\.md$/, ""),
        mtime: statSync(join(root, path)).mtimeMs,
      })),
    readNote: async (path) => {
      const match = files.find((file) => file === path.normalize("NFC"))
      return match ? readFileSync(join(root, match), "utf8") : null
    },
  }
}
