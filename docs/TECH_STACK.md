# Technology Stack

## Runtime stack — required for MVP

| Area | Choice |
|---|---|
| Language | TypeScript |
| Host | Desktop Obsidian plugin API |
| Build | esbuild for `main.js`, Tailwind CSS v4 CLI for `styles.css` |
| Validation | Zod |
| Agent foundation | Product-owned workflow state machine and tool loop; no agent framework (ADR 0008) |
| Model transport | Fetch through a small provider adapter |
| UI | React 19 in one `ItemView`, on the `design-system` component library (ADR 0005) |
| Settings | Obsidian `loadData` / `saveData` |
| Tests | Vitest, plus dependency-cruiser for the architecture boundaries |
| Background work | Bounded async queue; Worker only when measurement justifies it |

Retrieval uses Obsidian Vault and metadata APIs plus `bge-m3` embeddings served by the local Ollama (ADR 0009). The index is a file in the plugin folder; no native vector database or Python runtime is bundled with the plugin.

## UI layer

The Chat UI is React, bundled into `main.js` rather than loaded at runtime. ADR 0005 records the decision and its cost; [PLUGIN.md](./PLUGIN.md) records the mechanics.

The `design-system` workspace package holds the components and the token layer, and is consumed as source — the plugin's own esbuild compiles its `.tsx` files, so there is no build artifact to keep in sync. Storybook documents the panel's rules under `Fathomark/Chat`, which is where a change to the interaction model is reviewed before it reaches the plugin.

Styling is Tailwind CSS v4, compiled at build time to a static `styles.css`. Because Obsidian injects that file globally, Preflight is disabled, utilities carry a `tw:` prefix, content detection is explicit, and no rule selects outside `.fathomark-root`. The constraints and the reasoning are in [PLUGIN.md](./PLUGIN.md).

The plugin does not expose React, Tailwind, or design-system types across the harness boundary any more than it exposes provider ones. The Chat UI reads `RunEvent` and calls commands; `pnpm boundaries` fails the build if that stops being true.

## Agent foundation

LangChain, LangGraph, and Deep Agents are not used (ADR 0008). Measured on 2026-10-05, LangGraph or `createAgent` alone would add more than 1 MB to `main.js` against a 900 KB budget, and the fixed-step workflow does not need an open agent loop. The workflow, the bounded exploration loop, structured calls, and their zod validation are product-owned and tested directly.

Fathomark-owned `ModelProvider`, `ToolDefinition`, `RunEvent`, `ContextPacket`, and `EvidenceReference` contracts isolate the product from provider changes.

## Deferred JavaScript capabilities

- A workflow framework with persistence and checkpoints, only if resumable multi-session runs become a requirement and fit the bundle budget (ADR 0008)

Deep Agent frameworks and autonomous background runtimes are not required for MVP.

## Model providers

Providers sit behind the product-owned `ModelProvider` adapter. Today the only provider is Ollama's native API over localhost; `gemma4:e4b` is the default chat model and `bge-m3` the embedding model. Proposed (ADR 0010): the local model selects and checks evidence, the user's own Codex CLI drafts after explicit Data Egress Consent, and the local model drafts when no Codex subscription is available.

Workflow steps use tool-less structured calls with a JSON schema; native tool calling is used only in the exploration step. Whether the tool-calling evaluation gates in [MODEL_SELECTION.md](./MODEL_SELECTION.md) apply beyond that step is an open decision ([DIRECTION.md](./DIRECTION.md#열린-결정)).

## Model training

Fathomark does not train or fine-tune models. The earlier LoRA proposal (ADR 0003) is superseded; the `model/` directory records those experiments only. Knowledge belongs in retrieval and tools, style comes from the user's selected examples, and runtime reliability belongs in the Agent Harness.
