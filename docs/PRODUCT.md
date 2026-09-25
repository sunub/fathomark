# Fathomark Product Brief

## Problem

Users keep valuable context in Obsidian, but AI assistants typically operate outside the workspace, receive too much or too little context, hide tool activity, and generate text without reliable links to the notes that support it.

Fathomark brings the agent into Obsidian and focuses on the harness around the model: bounded context, explicit tools, visible sources, recoverable execution, and user-controlled writes.

## Product interaction model

Fathomark adapts the sidebar agent experience familiar from modern code editors to an Obsidian Vault. The reference is the interaction pattern, not the host platform: a persistent right-side view observes the active document or selection, streams an answer, exposes tool activity and sources, supports stop and retry, previews proposed changes, and applies them only after approval.

Obsidian remains the sole product surface. Fathomark is not a VS Code extension, a cross-editor agent, or a port of a coding agent. Terminal execution, unrestricted filesystem access, and autonomous multi-file editing are outside the MVP. Vault-aware retrieval, evidence provenance, and reversible note changes replace those coding-agent capabilities.

## Product promise

Fathomark helps a user understand and extend a note using the smallest sufficient set of evidence and the user's intended writing style, with every applied change remaining reviewable and reversible.

## Scope status

The MVP is an evolving product hypothesis rather than a frozen specification. Capabilities remain open to revision as their contribution to the product promise is tested. Writing Style Personalization is a required product outcome; its implementation mechanism remains an open decision.

## Primary user

A desktop Obsidian user who keeps research, technical notes, project knowledge, or long-form writing in a local Vault and wants to use a local LLM without surrendering control of source material or note changes.

## Initial experience: Vault Chat

```text
Current note or selection
    → bounded Vault retrieval and optional Wikipedia Research
    → source-linked context packet
    → local model with read-only tools
    → streamed answer and sources
    → insertion preview
    → explicit approve or discard
```

## MVP capabilities

- Right-side Obsidian view
- Sidebar agent interaction with visible run state, tool activity, stop, retry, and recovery
- Current note and selection awareness
- Local model configuration and health state
- Streaming response, stop, timeout, and retry
- Read-only `search_vault` and `read_note` tools
- Read-only Wikipedia search and page-reading tools
- Context budget across instructions, evidence, history, tool schemas, and output reserve
- Source list linked to Vault notes and approved external evidence
- Writing Style Personalization based on user-selected writing material
- Tool activity separated from assistant text
- Persistent, actionable failures that do not lock input
- Preview and diff before inserting generated text
- Undo-compatible approved insertion

## MVP non-goals

- Unrestricted general web search
- External model-provider UI
- Multi-agent orchestration
- Autonomous background work
- Automatic multi-note edits
- Long-term agent memory
- Attachment and frontmatter automation
- Semantic vector retrieval
- Mobile support
- Product-owned companion process
- LoRA as a predetermined personalization mechanism

## Product principles

1. **Evidence before confidence** — answers expose the notes that support them.
2. **Bounded context** — every model request has an explicit budget.
3. **Visible agency** — users can see tool use, waiting, cancellation, and failure.
4. **Read first, write with approval** — Vault reads are routine; mutations are proposed.
5. **Local by default** — external providers and network tools are conscious opt-ins.
6. **Harness over model magic** — reliability comes from policy, state, tests, and recovery rather than hidden prompt behavior.
7. **Preserve evidence conflicts** — Vault evidence governs the user's projects and intent, Wikipedia evidence governs general external facts, and disagreements remain visible with both sources.
8. **Minimize research egress** — Wikipedia queries contain only the public concepts needed for research and never disclose terms discovered only in the Vault.

## MVP acceptance criteria

1. A question can include the current note or selection without copying it manually.
2. The harness calls only the approved Vault and Wikipedia read tools during the MVP agent loop.
3. Every outbound request stays within its configured context and output budget.
4. Selected evidence is deduplicated and carries typed references: Vault-relative note locations for Vault evidence and canonical page references for Wikipedia evidence.
5. Tool activity appears once per tool call and never becomes assistant prose.
6. Streaming output has no duplicated or missing text.
7. Stop, timeout, provider error, and context exhaustion return to an input-ready state.
8. The answer distinguishes supported claims from unsupported model output.
9. No Vault file changes before explicit approval.
10. An approved insertion can be undone through Obsidian.
11. Plugin unload cancels requests and removes workers and event handlers.
12. A user can select a writing style and receive a draft that reflects it without weakening evidence references or write approval.
13. Wikipedia Research never expands into unrestricted browsing, and every external claim retains a visible Wikipedia source.
14. When Vault and Wikipedia evidence disagree, the answer presents the conflict and both sources instead of silently choosing one.
15. Every Wikipedia query is visible to the user and excludes Vault-only names, phrases, paths, and metadata.
16. On the representative 16 GB machine, Cold First Event Latency is at most 5 seconds at p95 for the default model; a candidate exceeding 8 seconds at p95 is rejected. With the model already loaded, the p95 target is 2 seconds.
17. The default model uses the provider's native tool/function-calling protocol and produces schema-bound arguments; prompt-only JSON emulation is not an accepted primary path.
18. Across at least 200 Fathomark tool scenarios, the default model selects the correct action on at least 95% of first attempts, produces schema-valid arguments on at least 98% of first attempts and 99.5% after at most one repair, causes zero disallowed tool executions, and enters zero non-terminating repeated-call loops.

## Deferred capabilities

- General web research beyond Wikipedia
- External model providers with Vault-content egress consent
- Embedding and reranking after lexical retrieval is measured
- LoRA adapters when evaluation shows they improve personalization or stable Obsidian workflow behavior over lighter-weight methods
- Reusable workflows, checkpoints, and bounded multi-step runs
- Companion engine only if profiling proves the plugin boundary insufficient
