# Fathomark Architecture

## System boundary

```text
Obsidian Desktop
└── Fathomark Plugin
    ├── Chat UI
    ├── Agent Harness
    ├── Agent Context Pipeline
    ├── Vault Tool Registry
    ├── Obsidian Adapters
    ├── Model Provider Adapter
    │       └── localhost → Ollama / llama.cpp / LM Studio
    └── Wikipedia Research Adapter
            └── network → Wikipedia
```

The initial product contains no MCP transport and no product-owned companion daemon. The local model provider is a separately installed runtime.

## Interaction boundary

The product borrows the interaction model of modern VS Code sidebar agents without targeting VS Code itself. Obsidian is the only host and user-facing surface. The analogous capabilities are mapped into the Vault domain:

| Editor-agent interaction | Fathomark behavior |
|---|---|
| Active file or selection context | Current note or selection context |
| Workspace search and file reads | Bounded Vault and Wikipedia read tools |
| Visible tool execution | Separate tool activity and source views |
| Streaming with stop and retry | Explicit run states with cancellation and recovery |
| Proposed code diff | Insertion preview and note diff |
| Apply and undo | Explicit approval and Obsidian-compatible undo |

The analogy stops at the interaction boundary. The MVP has no terminal tool, unrestricted filesystem access, autonomous multi-note editing, or VS Code extension.

## Components

### Plugin lifecycle

Registers the view, commands, settings, and Vault/workspace events. Startup must stay cheap; indexing or model calls cannot run directly in `onload`. Unload cancels active runs and releases every registered resource.

### Chat UI

Owns presentation only: conversation, context scope, tool activity, sources, errors, and insertion preview. It does not own model or tool policy.

### Agent Harness

Owns the explicit run state machine, provider selection, tool-call protocol, permissions, context budgeting, retry boundaries, cancellation, and execution trace.

Recommended run states:

```text
idle
preparing_context
waiting_for_model
streaming
waiting_for_tool_approval
executing_tool
preparing_answer
complete | incomplete | cancelled | failed
```

Terminal outcomes do not count as loading states and cannot permanently disable input.

### Agent Context Pipeline

Builds one Context Packet from the current note, selection, recent conversation, selected Vault evidence, and approved Wikipedia evidence. It deduplicates sources, preserves source type and provenance, and competes for the same request budget as tool schemas and output reserve.

### Tool Registry

Every tool declares:

- input and output schemas
- read, write, or network capability
- approval policy
- timeout and cancellation behavior
- result budget
- provenance adapter

MVP tools are read-only and limited to Vault retrieval and Wikipedia Research. Note insertion is an application action after preview, not an autonomous model tool.

### Model Provider

Provider adapters expose a small product-owned interface rather than leaking SDK types into the harness.

```ts
interface ModelProvider {
  listModels(): Promise<ModelInfo[]>;
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelEvent>;
  countTokens?(request: ModelRequest): Promise<TokenCount>;
}
```

The first provider remains an open decision: Ollama native API or generic OpenAI-compatible API.

The default model must support native tool or function calling through the selected provider, including schema-bound arguments and protocol-valid tool-result continuation. Prompting a plain text model to imitate JSON is not a supported primary path. The Agent Harness still validates every tool name and argument before execution and never treats model-declared capability as permission.

Tool-Call Reliability is measured on at least 200 Fathomark-specific scenarios, including cases where no tool should be called. A supported default model must reach at least 95% correct first-attempt action selection, 98% first-attempt schema validity, and 99.5% schema validity after at most one repair. The Agent Harness, independently of model quality, must guarantee that disallowed tools never execute and that repeated-call limits terminate loops.

### Model responsiveness

Model evaluation separates Cold First Event Latency from Time to Useful Result. On the representative 16 GB machine, the default model targets a cold p95 of at most 5 seconds and is disqualified if cold p95 exceeds 8 seconds. With the model already resident, the first-event p95 target is 2 seconds. A first event may be streamed assistant output or visible tool activity; a loading spinner alone does not satisfy the metric.

Provider telemetry should distinguish model load duration, prompt evaluation, generation, and tool execution when the runtime exposes those measurements. The Chat UI enters a visible waiting state immediately and keeps cancellation available throughout cold loading.

### Obsidian adapters

- Vault reads use the Obsidian Vault API.
- Current note and selection use workspace/editor APIs.
- File changes use editor/Vault mutation APIs and remain undo-compatible.
- Vault events replace filesystem watchers.

## Context budgeting

Every model call budgets the final request view, including:

- system instructions
- current note and selection
- selected evidence
- recent conversation
- tool schemas and arguments
- tool results
- output reserve
- safety margin

Canonical execution history is distinct from the compacted request view. Tool-call groups remain protocol-valid during compaction. Prefix truncation is not Context Compression.

## Background work

MVP retrieval is lexical and metadata-based. Expensive future work uses bounded workers and begins only after the workspace is ready. The plugin must not load models or scan the Vault during synchronous startup.

## Permission model

| Capability | MVP policy |
|---|---|
| Read current note | Allowed |
| Search/read Vault notes | Allowed and visible |
| Insert into current note | Preview and explicit approval |
| Modify multiple notes | Not available |
| Use external model | Not available initially |
| Search/read Wikipedia | Explicit network permission and visible sources |
| Access the general web | Not available initially |
| Send Vault text off-device | Not available initially |

Vault content is not sent to Wikipedia. When Vault evidence and Wikipedia evidence disagree, the Context Packet preserves both claims, their source types, and their references so the answer can expose the conflict. Vault evidence is authoritative for the user's projects and intent; Wikipedia evidence is authoritative for general external facts.

### Wikipedia query egress

Wikipedia Research sends only a minimal Outbound Research Query. Query construction must exclude names, verbatim phrases, note paths, properties, and metadata learned only from Vault evidence. The execution trace shows the exact query sent over the network. Raw Vault content is never used as a Wikipedia request body or search query.

## LangChain boundary

LangChain is an internal foundation within the Agent Harness, not the product boundary. It may provide:

- model and provider adapters
- message and tool-call types
- Zod-backed tool definitions
- the bounded model/tool agent loop
- streaming event normalization
- middleware hooks around model and tool calls

Fathomark wraps those capabilities in product-owned interfaces and events. The Agent Harness continues to own run state, tool allowlists, approval policy, context budgets, request and result limits, cancellation, Obsidian lifecycle, provenance, diff application, and recovery. LangChain types cannot leak into the Chat UI or Obsidian adapters.

LangGraph persistence, checkpoints, and multi-step workflows are deferred until the product requires resumable or reusable runs. The MVP does not gain background autonomy or long-term memory merely by using LangChain.
