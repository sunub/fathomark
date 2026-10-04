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
- Implement and evaluate example-based personalization (no model training)
- Add answer preview
- Add target range and diff rendering
- Add approve/discard controls
- Apply through Obsidian editor APIs
- Verify undo behavior and stale-editor protection

Exit condition: no model-generated content reaches the Vault without approval, every approved change can be undone, and example-based personalization preserves evidence while reflecting the selected style.

## Phase 3 — Retrieval quality (start first, per ADR 0007)

Retrieval is the critical risk of the career-writing workflow, so this phase is validated before further feature work: run real application questions by hand and check that the right experience notes surface.

- Use headings, links, backlinks, tags, and properties
- Prefer structured experience notes over opinion or study notes when ranking
- Report "no supporting note" instead of letting the model fill the gap
- Build a lexical retrieval evaluation set from real application questions
- Measure selection accuracy and answer grounding
- Introduce embeddings or reranking only if lexical retrieval fails an agreed target

## Phase 4 — Hosted providers and broader network tools

- Hosted provider adapter with the user's own key (first provider to be chosen)
- Secure API-key storage decision
- Vault-content egress consent that shows what will be sent
- General web research beyond Wikipedia with domain/source visibility
- Network permission settings

## Phase 5 — Advanced harness

- Add reusable workflows and bounded multi-step runs
- Reconsider a companion engine only from measured plugin limits

Model training is not planned (ADR 0007).

## Open decision order

Resolve one at a time:

1. Model context and output budget
2. Korean writing, grounding, and personalization evaluation gates
3. Local provider only: resident-memory, idle-unload, and quantization policy
4. First hosted provider and contract; Ollama native or OpenAI-compatible remain options for the local provider
5. Named default-model research and benchmark
6. Evidence reference granularity: note, heading, block, or range
7. Lexical retrieval and cache strategy
8. Insert-preview diff interaction
9. Hosted-provider key storage and the Data Egress Consent experience
10. General web research provider and permission UX
11. Style-example selection experience for resume bullets and essay answers

Resolved: UI implementation is React (ADR 0005).
