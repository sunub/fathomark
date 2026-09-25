# Local Model Selection and Evaluation

## Status

This document consolidates the model-selection decisions reached during product design. It defines what Fathomark needs from a local model before naming a specific model. Items under **Accepted criteria** are current product requirements. Items under **Open decisions** remain proposals and must not be treated as settled architecture.

## Workload to optimize

Fathomark does not need a local model primarily for broad, deep reasoning. Its default model must reliably perform a bounded editor-agent workload:

1. understand the current note, selection, and user request;
2. decide whether to answer directly or call an approved Vault or Wikipedia tool;
3. produce schema-valid tool arguments and continue from tool results;
4. preserve the provenance of selected evidence and expose conflicts;
5. write in the user's selected style without changing the facts; and
6. stream a reviewable draft for preview-and-approve insertion.

General benchmark rank and parameter count are therefore secondary to measured latency, Tool-Call Reliability, grounding, Korean writing quality, and personalization quality on Fathomark tasks.

## Expected user flow

```text
Open a note or select text
    → enter a request and choose a writing style
    → build a small decision context
    → answer directly or call an approved read tool
    → retrieve bounded Vault and optional Wikipedia evidence
    → deduplicate, rank, and compress evidence into a Context Packet
    → synthesize an evidence-backed draft in the chosen style
    → inspect sources, conflicts, and tool activity
    → preview the proposed insertion
    → approve, discard, or request a revision
```

The first model call should contain only what is needed to choose an action. Style examples and the final evidence packet belong mainly in the synthesis call. Search results and full Wikipedia pages must not be copied wholesale into model context. Canonical execution history may be larger than the compacted request view, but tool-call groups must remain protocol-valid.

## Accepted criteria

### Representative environment

Performance gates are evaluated on a representative 16 GB machine while Obsidian and the local provider are running. The current 48 GB Apple Silicon development machine is useful for comparison but is not the baseline that determines whether a default model is sufficiently lightweight.

The exact resident-memory ceiling and default parameter range are still open decisions.

### Responsiveness

Fathomark measures the first visible model output or tool activity, not a loading spinner and not only the first natural-language token.

| Metric | Requirement |
|---|---|
| Cold First Event Latency | p95 target at or below 5 seconds |
| Cold candidate rejection | reject above 8 seconds p95 |
| Warm First Event Latency | p95 target at or below 2 seconds |

Measurements must separate model load duration, prompt evaluation, generation, and tool execution where the provider exposes those values. Time to Useful Result is tracked separately because a correct visible tool call may precede the first prose answer.

### Native tool calling

The default model must use the provider's native tool or function-calling protocol with schema-bound arguments and protocol-valid continuation from tool results. Prompting a plain text model to imitate JSON is not an accepted primary path.

Native capability is necessary but not sufficient. The Agent Harness validates every tool name and argument before execution, enforces the allowlist, limits repeated calls, and never treats model-declared capability as permission.

### Tool-Call Reliability

Evaluation uses at least 200 Fathomark-specific scenarios, including cases where the correct action is to call no tool.

| Gate | Requirement |
|---|---:|
| Correct first-attempt action selection | at least 95% |
| First-attempt schema-valid arguments | at least 98% |
| Schema-valid arguments after at most one repair | at least 99.5% |
| Disallowed tool executions | 0 |
| Non-terminating repeated-call loops | 0 |

The last two are Harness guarantees as well as evaluation outcomes. A model-generated invalid or disallowed call must never reach a tool implementation.

### Writing Style Personalization

Writing in the user's intended voice and direction is a required product outcome. LoRA is not yet a required implementation mechanism. Prompted style profiles, retrieved examples, and LoRA adapters must eventually be compared against the same personalization evaluation rather than selected by assumption.

The current design direction is user-selected, on-device personalization. A text passage the user explicitly selects is treated as their intended style reference; the product does not scan the Vault to infer a writing style. The selected passage and explicit pairwise preferences may inform a local personalization profile and, when evaluation supports it, a user-specific LoRA candidate.

Retrieval remains the canonical source for Vault facts and current external knowledge. A style adapter is not a knowledge source and must not replace evidence retrieval. Because a selected style passage can contain factual content, candidate adapters must be evaluated for unsupported recall or reproduction of facts that are absent from the current request and evidence. The intended style signal and factual grounding are evaluated separately.

Personalization comparisons use the same request, evidence, base model, and generation settings; only the personalization method changes. Responses that fail grounding or safety checks do not proceed to style preference comparison. Eligible responses are presented in randomized, method-blind order with choices for either response, no meaningful difference, or neither. Preference feedback records are not sufficient by themselves to update the active adapter: a candidate must first pass held-out evaluation, then be explicitly applied by the user. Detailed rubrics, thresholds, retention and deletion behavior, and the initial LoRA objective remain open decisions. See [ADR 0006](./adr/0006-user-selected-style-personalization.md).

## Local-memory implications

Parameter names such as 7B and 9B are approximate counts of learned parameters, not RAM guarantees or quality rankings. A theoretical 7B model at four bits contains about 3.5 GB of raw weight values, but a real runtime also needs quantization metadata, buffers, KV cache, prompt state, and memory for Obsidian and the operating system.

Published local-product examples illustrate the difference:

- GPT4All lists an 8B Q4 model at about 4.66 GB with 8 GB RAM required, and a 3.8B Q4 model at about 2.18 GB with 4 GB RAM required: [GPT4All model documentation](https://docs.gpt4all.io/gpt4all_desktop/models.html).
- Ollama keeps a model loaded for five minutes by default and supports immediate unload through `keep_alive: 0`: [Ollama FAQ](https://docs.ollama.com/faq).
- LM Studio supports just-in-time loading, idle TTL, and automatic eviction of unused models: [LM Studio idle TTL and auto-evict](https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict).

The memory belongs primarily to the separately installed local model runtime, not to the Obsidian plugin process. It still affects the user's total product experience, especially on unified-memory machines. Fathomark must therefore measure full-system memory pressure rather than report only model file size.

Loading on demand and unloading after an idle period is the current recommendation, but the default TTL and whether a keep-warm mode is exposed remain open decisions.

## Proposed context flow — not yet accepted

The current proposal is to require a model with at least a 16K native context window while limiting the default request view to 8K tokens on the representative 16 GB environment. This has not been accepted.

A candidate 8K request budget was sketched as follows:

| Content | Proposed tokens |
|---|---:|
| System instructions and tool schemas | 1,000 |
| User request and current selection | 1,200 |
| Vault and Wikipedia evidence | 2,500 |
| Writing style profile and examples | 1,000 |
| Recent conversation | 500 |
| Output reserve | 1,200–1,500 |
| Safety margin | remainder |

Before adopting this proposal, evaluation must measure Korean tokenizer efficiency, prompt-evaluation latency at the full budget, evidence recall near the end of the context, protocol-valid compaction, and whether style examples displace factual evidence. A proposed single-generation output limit of roughly 1,500 tokens also remains unresolved.

## Evaluation dimensions still to define

The following dimensions are required before selecting a named default model, but their pass thresholds have not been agreed:

- Korean instruction following and natural writing quality;
- writing-style similarity, controllability, and factual preservation;
- answer grounding and unsupported-claim rate;
- effective context length and request/output budgets;
- resident memory, peak memory, load/unload policy, and acceptable swap pressure;
- quantization format and quality loss;
- one official default model versus multiple hardware tiers;
- LoRA and QLoRA training feasibility, adapter size, and runtime support;
- commercial-use and redistribution license terms;
- Ollama, llama.cpp, and LM Studio compatibility; and
- the initial provider contract: Ollama native API or a generic OpenAI-compatible API.

## Candidate-selection sequence

When the remaining gates are defined, model research should proceed in this order:

1. Eliminate candidates that lack an acceptable license, native tool calling, provider compatibility, or the required context capability.
2. Measure cold and warm latency plus full-system memory on the representative machine.
3. Run the 200-scenario Tool-Call Reliability suite.
4. Measure grounding, Korean writing, and style-personalization quality on fixed fixtures.
5. Compare lighter prompting/retrieval personalization against LoRA only after the non-training baseline is known.
6. Select one default model; keep a second model only as an evaluation reference unless measured user value justifies another supported tier.

No named model should be documented as the default until it passes this sequence.

## Open decisions

1. Accept or revise the proposed 16K model capability and 8K default request budget.
2. Define the maximum default output length and long-form sectioning workflow.
3. Set Korean writing, grounding, and personalization evaluation methods and thresholds.
4. Set the resident and peak memory limits for the representative 16 GB environment.
5. Decide the idle unload TTL and optional keep-warm behavior.
6. Choose the quantization target.
7. Decide whether one default model is sufficient or a second supported hardware tier is justified.
8. Decide the first provider contract.
9. Research and benchmark named open-weight model candidates against the completed gate set.
