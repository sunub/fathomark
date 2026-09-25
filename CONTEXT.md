# Fathomark Context

Fathomark is an Obsidian-native workspace where an AI agent uses Vault knowledge as bounded, source-linked working context.

## Language

**Fathomark**:
The desktop-only Obsidian product that helps users reason and write with source-grounded Vault context.
_Avoid_: Obsidian MCP Server, general-purpose chatbot

**Vault Chat**:
The initial experience that answers from the current note and selected evidence, cites its sources, writes in the user's intended style, and inserts generated content only after user approval.
_Avoid_: Vault Copilot (former name), autonomous note editor, chat that answers without sources

**Sidebar Agent Experience**:
The interaction model that brings a visible, streaming, tool-using editor agent into Obsidian's right sidebar, adapted to Vault retrieval, evidence review, and approval-based note changes. Modern VS Code agents are a UX reference, not a second product surface.
_Avoid_: VS Code extension, cross-editor product, chatbot embedded in a sidebar

**Writing Style Personalization**:
The product capability that makes generated writing reflect the user's chosen voice and writing direction while preserving factual grounding and user control.
_Avoid_: Generic tone preset, unrestricted imitation

**Wikipedia Research**:
The bounded external research capability that searches and reads Wikipedia with visible source references.
_Avoid_: General web search, unrestricted browsing

**Evidence Conflict**:
A visible disagreement between Vault evidence and Wikipedia evidence. Fathomark preserves both claims and their provenance instead of silently selecting or merging them.
_Avoid_: Automatic correction, hidden source precedence

**Outbound Research Query**:
The minimal public-topic query sent to Wikipedia after research is enabled. It excludes names, phrases, paths, and metadata discovered only in the Vault.
_Avoid_: Vault excerpt, unfiltered model-generated query

**Vault Context Layer**:
The role of an Obsidian Vault as a long-term context source from which an agent selects and compresses working evidence.
_Avoid_: Search index, note database

**Agent Context Pipeline**:
The end-to-end flow that retrieves Vault material, selects relevant evidence, compresses it, and provides it as bounded model context.
_Avoid_: Search engine, document lookup

**Context Packet**:
A bounded collection of source-linked evidence prepared for one model request.
_Avoid_: Prompt dump, raw search results

**Context Compression**:
The act of reducing selected Vault material while retaining claims, evidence, and source references.
_Avoid_: Arbitrary truncation, simple summary

**Agent Harness**:
The Fathomark-owned execution environment that governs model selection, tool access, context budgets, permissions, cancellation, retries, provenance, and observable run state. It may use LangChain internally without delegating these product policies to LangChain.
_Avoid_: Model, chatbot, synonym for LangChain

**Local-First Execution**:
The policy that model execution, Vault retrieval, and context preparation use local providers by default, while external providers and network tools require explicit user choice.
_Avoid_: Local-only operation, cloud-first execution

**Model Provider**:
A replaceable adapter through which the Agent Harness lists models, streams responses, reports usage, and handles cancellation.
_Avoid_: Agent, model runtime policy

**Supported Local Model**:
A provider-visible local model that passes Fathomark's measured responsiveness and native tool-calling gates. Being installable or listed by a provider does not by itself make a model supported.
_Avoid_: Any local model, provider-listed model

**Tool-Call Reliability**:
The measured ability of a model to choose whether and which Fathomark tool to call, provide valid arguments, continue from results, and stop without redundant calls.
_Avoid_: Tool support claim, JSON validity alone

**Cold First Event Latency**:
The elapsed time from starting a run with an unloaded local model until the first visible model output or tool activity appears.
_Avoid_: Total answer time, first token only

**Time to Useful Result**:
The elapsed time from starting a run until the user receives the first evidence-backed result that advances the task.
_Avoid_: Model load time, raw token throughput

**Evidence Reference**:
A stable, typed pointer from a generated claim to either a Vault-relative note location or a canonical approved external source location.
_Avoid_: Generic citation, untyped filename-only label

**Training Workspace**:
The optional Python environment used to prepare datasets, train and evaluate LoRA adapters, and export model artifacts.
_Avoid_: Plugin runtime, user installation requirement
