# Next Session

## Required reading

1. `README.md`
2. `CONTEXT.md`
3. `docs/PRODUCT.md`
4. `docs/ARCHITECTURE.md`
5. `docs/TECH_STACK.md`
6. `docs/PLUGIN.md`
7. `docs/ROADMAP.md`
8. `docs/MODEL_SELECTION.md`
9. `docs/adr/`

## Current state

- Product name: Fathomark
- Initial experience: Vault Chat
- Platform: desktop-only Obsidian plugin
- Interaction model: a modern editor-style sidebar agent adapted to Vault evidence and approval-based note changes
- Product boundary: Obsidian is the sole surface; VS Code is a UX reference, not a target extension; there is no MCP server or user-facing CLI
- Runtime boundary: plugin-contained Agent Harness; local LLM runs through a separate local provider
- Framework boundary: LangChain supplies internal model, message, tool, streaming, and agent-loop mechanics; Fathomark owns policy, state, budgets, provenance, lifecycle, and recovery
- Default policy: local-first
- MVP tools: `search_vault`, `read_note`, and bounded Wikipedia search/page reading with explicit network permission
- Default-model latency gates: cold first event p95 target 5 seconds, reject above 8 seconds; warm target 2 seconds on a representative 16 GB machine
- Default-model protocol: native tool/function calling; prompt-only JSON emulation is not supported
- Tool-call evaluation: at least 200 scenarios with the thresholds in `docs/MODEL_SELECTION.md`
- Writes: preview and approval only
- Personalization: user-style output is required; LoRA versus lighter-weight mechanisms remains open
- Training boundary: a separate optional Python/PyTorch workspace is proposed in ADR 0003 but not yet accepted
- UI implementation: React on the `design-system` package, decided in ADR 0005
- Implementation: Phase 0 skeleton in place — the plugin builds, opens a sidebar view, streams a fake response through the harness, cancels it, and unloads. No real provider and no registered tool yet. `main.js` is 286 KB minified, which is the pre-LangChain baseline.
- Repository: the root is now the plugin's publishing surface (`manifest.json`, `versions.json`, release workflow). `design-system/` still carries its own git repository and is excluded from the root one, so a clone cannot build the plugin — this must be resolved before submitting to the community directory.

## What the skeleton deliberately does not do

- No LangChain in the bundle. The seam is `plugin/src/harness/harness.ts` and `pnpm boundaries` keeps it there. Leaving it empty for one phase gives a size baseline to compare `createAgent` against.
- No registered tools. A half-built tool is one the model can call.
- No Context Compression. `plugin/src/context/packet.ts` throws rather than substituting truncation, which CONTEXT.md says is not compression.
- The budget numbers in `plugin/src/harness/budget.ts` are the proposal below, in one place, not an accepted decision.

## First unresolved model decision

Accept or revise the proposed context envelope:

- Require at least 16K native model context
- Limit the default request view to 8K on the representative 16 GB machine
- Reserve roughly 1,200–1,500 output tokens

The context decision must be tested against the actual user flow, Korean tokenization, tool-message preservation, prompt-evaluation latency, evidence recall, and style-example pressure. The initial provider contract remains open immediately after this decision.

## Session start prompt

```text
Read README.md, CONTEXT.md, docs/PRODUCT.md, docs/ARCHITECTURE.md, docs/TECH_STACK.md, docs/MODEL_SELECTION.md, docs/ROADMAP.md, and all docs/adr files before proposing changes.

Fathomark is a desktop-only, local-first Obsidian agent workspace. Its MVP is Vault Chat: a modern editor-style sidebar agent experience adapted to source-grounded answers from the current note, selected Vault evidence, and bounded Wikipedia Research, with preview-and-approve insertion. Obsidian is the sole product surface; VS Code is an interaction reference, not a target extension. The initial Agent Harness runs inside the plugin and uses LangChain only for internal model, message, tool, streaming, and agent-loop mechanics; Fathomark retains run state, permissions, context budgets, provenance, lifecycle, and recovery. The local LLM is a separate provider. There is no MCP server, companion daemon, unrestricted general web search, external model provider UI, semantic vector database, or autonomous multi-note editing in the MVP.

The Phase 0 skeleton exists: plugin/ builds to main.js and styles.css, the Chat UI renders on the design-system package, and the Agent Harness streams a deterministic fake provider through its run states with cancellation. LangChain is not in the bundle yet, no tool is registered, and no real provider is connected.

Continue the product-design interview one decision at a time. The first unresolved model decision is whether to accept the proposed 16K model capability and 8K default request budget described in docs/MODEL_SELECTION.md. Do not treat the proposal as accepted or name a default model until the remaining evaluation gates are approved. The budget numbers already in plugin/src/harness/budget.ts are that proposal written down in one place, not a decision that has been made.
```
