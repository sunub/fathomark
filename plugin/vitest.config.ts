import { resolve } from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      // `obsidian` is provided by the app at runtime and has no npm implementation.
      // Tests that touch it use the stub in tests/obsidian-stub.ts.
      obsidian: resolve(import.meta.dirname, "tests/obsidian-stub.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
})
