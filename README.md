# Fathomark

**Grounded intelligence for your notes.**

Fathomark is a desktop-only AI workspace for Obsidian. Its first experience, **Vault Chat**, brings the visible, tool-using sidebar workflow familiar from modern editor agents into Obsidian: it uses the current note and selected evidence to produce source-grounded answers and proposes note changes for explicit user approval. Its first job is career writing: turning a job posting or application question into resume bullets and essay answers that cite your own notes and read like your own writing.

## Status

The career-writing workflow runs end to end on a local Ollama model (`gemma4:e4b` by default): request analysis, hybrid Vault retrieval, a readiness check, outline, draft, claim-by-claim verification, preview, and insertion after approval. Known problems and the next steps are in [DIRECTION.md](./docs/DIRECTION.md). Writing with the user's Codex CLI is proposed but not implemented ([ADR 0010](docs/adr/0010-local-curation-codex-drafting.md)).

## Network use

Both of today's network paths are listed here rather than buried:

- **A local model provider over localhost.** You install and run it yourself — Ollama, llama.cpp, LM Studio or another. Today Fathomark sends vault content nowhere else.
- **Wikipedia, only if you turn Wikipedia Research on.** It is off by default. Queries carry only public topic terms and never names, phrases, paths or metadata found only in your vault, and every query sent is visible in the run's tool activity.

Drafting with your own Codex CLI is proposed ([ADR 0010](docs/adr/0010-local-curation-codex-drafting.md)) and not implemented. When it ships, the local model selects the evidence a request needs, and only that evidence leaves your machine, after consent that shows what will be sent.

There is no telemetry, no account, and no general web access.

## Product boundaries

- Obsidian is the only user-facing product surface.
- VS Code-style sidebar agents are an interaction reference, not an additional target platform or extension.
- The initial Agent Harness runs inside the desktop plugin.
- The workflow and agent loop are product-owned code; LangChain and LangGraph are not used ([ADR 0008](docs/adr/0008-no-agent-framework.md)).
- The model sits behind a replaceable provider adapter: Ollama's native API today. The proposed split is a local model that selects and checks evidence and your Codex CLI that drafts, with the local model drafting when no Codex subscription is available.
- There is no MCP server, general-purpose CLI product, or product-owned companion daemon in the initial architecture.
- Vault content leaves your machine only after explicit consent that shows what will be sent. Network access is limited to a drafting model you choose and bounded Wikipedia Research; other network tools are deferred.
- Fathomark does not train or fine-tune models. Personalization uses your own selected writing as examples ([ADR 0007](docs/adr/0007-grounded-career-writing-with-hosted-models.md)).

## MVP

Vault Chat lets a user:

1. Ask a question from the current note or selection.
2. Search and read only the needed Vault evidence and, when explicitly enabled, bounded Wikipedia evidence.
3. Stream a source-linked answer from the configured model in the selected writing style.
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
- [Model selection and evaluation](./docs/MODEL_SELECTION.md)
- [Direction: current state, next steps, open decisions](./docs/DIRECTION.md)
- [Domain language](./CONTEXT.md)
- [Architecture decisions](./docs/adr/)

## Recommended next step

Read [DIRECTION.md](./docs/DIRECTION.md). The next step is the A/B check that decides ADR 0010.
