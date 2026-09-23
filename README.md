# Fathomark

**Grounded intelligence for your notes.**

Fathomark is a desktop-only, local-first AI workspace for Obsidian. Its first experience, **Vault Copilot**, brings the visible, tool-using sidebar workflow familiar from modern editor agents into Obsidian: it uses the current note and selected evidence to produce source-grounded answers and proposes note changes for explicit user approval.

## Status

Phase 0. The plugin builds, opens a sidebar view, streams a fake response through the Agent Harness, cancels it, and unloads cleanly. No real model provider is connected yet, and no tool is registered.

## Network use

Fathomark is local-first, and both of its network paths are listed here rather than buried:

- **A local model provider over localhost.** You install and run it yourself — Ollama, llama.cpp, LM Studio or another. Fathomark never sends vault content anywhere else.
- **Wikipedia, only if you turn Wikipedia Research on.** It is off by default. Queries carry only public topic terms and never names, phrases, paths or metadata found only in your vault, and every query sent is visible in the run's tool activity.

There is no telemetry, no account, no external model provider, and no general web access.

## Product boundaries

- Obsidian is the only user-facing product surface.
- VS Code-style sidebar agents are an interaction reference, not an additional target platform or extension.
- The initial Agent Harness runs inside the desktop plugin.
- LangChain supports the model, message, tool, streaming, and agent-loop layer inside the product-owned harness; it does not define product permissions or lifecycle.
- Ollama, llama.cpp, or another local model provider runs separately and is called over a local API.
- There is no MCP server, general-purpose CLI product, or product-owned companion daemon in the initial architecture.
- Local execution is the default. MVP network access is an explicit opt-in limited to bounded Wikipedia Research; other external providers and network tools are deferred.
- The current proposal places Python and PyTorch in an optional LoRA training workspace rather than the plugin runtime; the personalization mechanism is still under evaluation.

## MVP

Vault Copilot lets a user:

1. Ask a question from the current note or selection.
2. Search and read only the needed Vault evidence and, when explicitly enabled, bounded Wikipedia evidence.
3. Stream a source-linked answer from a local LLM in the selected writing style.
4. Review the sources and tool activity.
5. Preview a proposed insertion and apply it only after approval.

## Development

```bash
pnpm install
pnpm build                                  # main.js + styles.css at the repository root
FATHOMARK_VAULT=~/vaults/scratch pnpm dev   # watch, straight into a scratch vault
pnpm typecheck && pnpm test && pnpm boundaries
pnpm storybook                              # the design system
```

The repository root is the plugin's publishing surface: `manifest.json` and `versions.json` are committed there, and `main.js` and `styles.css` are built there and attached to a release. Sources live in `plugin/`, the component library in `design-system/`, and the optional training workspace in `model/`. [PLUGIN.md](./docs/PLUGIN.md) has the details.

## Documentation

- [Product brief](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Technology stack](./docs/TECH_STACK.md)
- [Plugin workspace, build and release](./docs/PLUGIN.md)
- [Local model selection and evaluation](./docs/MODEL_SELECTION.md)
- [Roadmap](./docs/ROADMAP.md)
- [Domain language](./CONTEXT.md)
- [Next session](./docs/NEXT_SESSION.md)
- [Architecture decisions](./docs/adr/)

## Recommended next step

Read [NEXT_SESSION.md](./docs/NEXT_SESSION.md) and continue the unresolved model-selection decisions before naming a default model.
