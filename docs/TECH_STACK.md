# Technology Stack

## Runtime stack — required for MVP

| Area | Choice |
|---|---|
| Language | TypeScript |
| Host | Desktop Obsidian plugin API |
| Build | esbuild for `main.js`, Tailwind CSS v4 CLI for `styles.css` |
| Validation | Zod |
| Agent foundation | LangChain JS, behind Fathomark-owned interfaces |
| Model transport | Fetch through a small provider adapter |
| UI | React 19 in one `ItemView`, on the `design-system` component library (ADR 0005) |
| Settings | Obsidian `loadData` / `saveData` |
| Tests | Vitest, plus dependency-cruiser for the architecture boundaries |
| Background work | Bounded async queue; Worker only when measurement justifies it |

MVP retrieval uses Obsidian Vault and metadata APIs. No native vector database or Python runtime is bundled with the plugin.

## UI layer

The Chat UI is React, bundled into `main.js` rather than loaded at runtime. ADR 0005 records the decision and its cost; [PLUGIN.md](./PLUGIN.md) records the mechanics.

The `design-system` workspace package holds the components and the token layer, and is consumed as source — the plugin's own esbuild compiles its `.tsx` files, so there is no build artifact to keep in sync. Storybook documents the panel's rules under `Fathomark/Chat`, which is where a change to the interaction model is reviewed before it reaches the plugin.

Styling is Tailwind CSS v4, compiled at build time to a static `styles.css`. Because Obsidian injects that file globally, Preflight is disabled, utilities carry a `tw:` prefix, content detection is explicit, and no rule selects outside `.fathomark-root`. The constraints and the reasoning are in [PLUGIN.md](./PLUGIN.md).

The plugin does not expose React, Tailwind, or design-system types across the harness boundary any more than it exposes LangChain ones. The Chat UI reads `RunEvent` and calls commands; `pnpm boundaries` fails the build if that stops being true.

## LangChain role

LangChain supports the replaceable mechanics of the agent loop:

- model and message abstractions
- Zod-backed tool definitions and structured arguments
- streaming model and tool events
- bounded model-to-tool-to-model execution
- middleware hooks for validation, tracing, retry boundaries, and event translation

The MVP uses the `langchain` JavaScript package for `createAgent` and middleware, with `@langchain/core` types where direct model, message, and tool contracts are needed. Provider-specific integration packages are admitted only behind the product-owned `ModelProvider` adapter.

The plugin does not expose LangChain objects directly to the Chat UI, Vault adapters, or persisted settings. Fathomark-owned `ModelProvider`, `ToolDefinition`, `RunEvent`, `ContextPacket`, and `EvidenceReference` contracts isolate the product from framework and provider changes.

LangChain does not own permissions, context selection, context budgets, approval, provenance, Obsidian lifecycle, diff application, or recovery. Those remain explicit Agent Harness policies with independent tests.

## Deferred JavaScript capabilities

- LangGraph persistence and checkpoints when resumable multi-step workflows become a product requirement
- `@langchain/textsplitters` when measured retrieval quality shows chunking is necessary
- Transformers.js or a local embedding API only after semantic retrieval is justified by evaluation

Deep Agent frameworks and autonomous background runtimes are not required for MVP.

## Local model runtime

The user runs a provider such as Ollama, llama.cpp, or LM Studio. Fathomark calls it over localhost. The initial adapter is still to be selected.

The default model must expose native tool/function calling through that adapter. Provider model discovery may list other models, but Fathomark support requires passing the product's latency and tool-call evaluation gates; prompt-only JSON emulation is not the default integration path.

## Proposed optional training stack

The current proposal keeps LoRA training as a developer workflow separated from the plugin runtime. ADR 0003 remains proposed until the first personalization objective and evaluation dataset are defined.

```text
Python 3.11 or 3.12
PyTorch
Transformers
PEFT
TRL
Datasets
Accelerate
Safetensors
```

Possible repository location:

```text
training/
├── pyproject.toml
├── configs/
├── datasets/
├── scripts/
│   ├── prepare_dataset.py
│   ├── train_lora.py
│   ├── evaluate.py
│   └── export_adapter.py
└── tests/
```

Under this proposal, the plugin does not require users to install Python and consumes adapters through the configured model provider.

## LoRA scope

Good training targets:

- reliable tool selection and structured arguments
- source-citation response format
- propose-diff-before-write behavior
- stable Markdown and frontmatter conventions
- a chosen writing style

Bad training targets:

- changing Vault facts
- current project documentation
- web knowledge
- context budgeting, retry, and permissions

Knowledge belongs in retrieval and tools. Runtime reliability belongs in the Agent Harness.
