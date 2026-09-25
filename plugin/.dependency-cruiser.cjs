/*
 * The architecture boundaries from docs/ARCHITECTURE.md, as a test.
 *
 * Both rules below restate something the document already says. They are here
 * because a boundary that is only written down is a boundary that erodes: the
 * first time a UI component needs "just one field" off a LangChain message, the
 * review that would have caught it is the one nobody ran.
 *
 *   pnpm boundaries
 */
module.exports = {
  forbidden: [
    {
      name: "ui-owns-no-policy",
      comment:
        "Chat UI owns presentation only. It reads RunEvent and calls commands; " +
        "it does not reach into the harness, providers, tools, or Obsidian APIs. " +
        "ARCHITECTURE.md: 'It does not own model or tool policy.'",
      severity: "error",
      from: { path: "^src/ui" },
      to: {
        /*
         * Named module by module rather than folder by folder, because the
         * distinction is not where a file lives but what it is. events.ts,
         * run-state.ts, budget.ts and policy.ts are the product-owned contract
         * and pure functions over it — the UI is supposed to read those.
         * harness.ts is the engine, and the rest reach the model, the network,
         * or the vault. None of those belong in a component.
         */
        path: [
          "^src/harness/harness\\.ts$",
          "^src/providers/",
          "^src/tools/",
          "^src/obsidian/",
        ],
      },
    },
    {
      name: "langchain-stays-in-the-harness",
      comment:
        "LangChain is an internal foundation inside the Agent Harness, not the " +
        "product boundary. TECH_STACK.md: 'The plugin does not expose LangChain " +
        "objects directly to the Chat UI, Vault adapters, or persisted settings.'",
      severity: "error",
      from: { pathNot: "^src/harness" },
      to: { path: "node_modules/(langchain|@langchain)" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: "^src/main\\.ts$" },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },
  },
}
