# Roadmap

## Phase 0 — Product skeleton

Done:

- Plugin workspace, build, and release pipeline (see [PLUGIN.md](./PLUGIN.md))
- Right-side view, ribbon icon, commands, and settings tab
- Agent Harness state machine with cancellation and an explicit permission table
- Deterministic fake model provider
- Chat UI on the design system: header, transcript, budget bar, always-present composer
- Harness, run-state, permission, evidence, and panel-store tests
- Architecture boundaries enforced by `pnpm boundaries`

Remaining:

- Show the current note and selection in the panel, not only in the context packet
- Integrate the LangChain agent loop behind Fathomark-owned run events and policy interfaces
- Measure the bundle-size delta that the agent loop adds against the current baseline
- Lifecycle tests that exercise a real `onload` / `onunload` cycle rather than the harness alone

Exit condition: the plugin loads quickly, opens a VS Code-style sidebar agent experience inside Obsidian, runs a fake streamed response through the harness, cancels it, and unloads without leaked resources or LangChain types crossing the harness boundary.

## Phase 1 — Read-only Vault Chat

- Select the first local model-provider contract
- Implement provider health, model selection, streaming, and cancellation
- Benchmark cold and warm first-event latency on a representative 16 GB machine
- Evaluate native tool selection, schema-bound arguments, and tool-result continuation
- Implement `search_vault` and `read_note`
- Implement bounded Wikipedia search and page reading with explicit network permission
- Create Context Packet and Evidence Reference types
- Enforce request context budget
- Add sources and tool activity panels
- Add context overflow and provider failure recovery

Exit condition: fixed fixture questions return the expected Vault- and Wikipedia-linked answers without duplicate tool calls or output, a conflicting-source fixture exposes both claims, and the default model meets the documented latency and Tool-Call Reliability gates across at least 200 scenarios.

## Phase 2 — Approved insertion

- Define the user-selected writing material and Writing Style Profile flow
- Implement and evaluate a non-training personalization baseline
- Add answer preview
- Add target range and diff rendering
- Add approve/discard controls
- Apply through Obsidian editor APIs
- Verify undo behavior and stale-editor protection

Exit condition: no model-generated content reaches the Vault without approval, every approved change can be undone, and the baseline personalization path preserves evidence while reflecting the selected style.

## Phase 3 — Retrieval quality

- Use headings, links, backlinks, tags, and properties
- Build a lexical retrieval evaluation set
- Measure selection accuracy and answer grounding
- Introduce embeddings or reranking only if lexical retrieval fails an agreed target

## Phase 4 — Optional providers and broader network tools

- External provider adapters
- Secure API-key storage decision
- Vault-content egress consent
- General web research beyond Wikipedia with domain/source visibility
- Network permission settings

## Phase 5 — Training and advanced harness

- Collect opt-in, privacy-safe failure examples
- Define behavior evals before training
- Add the Python training workspace
- Train and compare LoRA adapters against the non-training personalization baseline
- Add reusable workflows and bounded multi-step runs
- Reconsider a companion engine only from measured plugin limits

## Open decision order

Resolve one at a time:

1. Model context and output budget
2. Korean writing, grounding, and personalization evaluation gates
3. Model resident-memory, idle-unload, and quantization policy
4. Initial model provider: Ollama native or OpenAI-compatible
5. Named default-model research and benchmark
6. Evidence reference granularity: note, heading, block, or range
7. Lexical retrieval and cache strategy
8. Insert-preview diff interaction
9. First LoRA behavior objective
10. External provider key storage
11. General web research provider and permission UX

Resolved: UI implementation is React (ADR 0005).
