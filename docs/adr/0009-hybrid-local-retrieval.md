---
status: accepted
---

# Retrieve experience with hybrid local search and a local judge

> Recorded on 2026-10-12. Amends [ADR 0007](./0007-grounded-career-writing-with-hosted-models.md), which left "the retrieval method beyond lexical search" open, and replaces the "semantic vector retrieval" non-goal in [PRODUCT.md](../PRODUCT.md).

## Context

ADR 0007 named retrieval as the critical risk and allowed embeddings only if lexical search failed an agreed target. The target, fixed on 2026-10-06 for a real-notes evaluation set, requires all four: recall@3 ≥ 0.75, no-evidence block rate ≥ 0.90, wrongly blocked answerable questions ≤ 0.20, and a non-experience note ranked first ≤ 0.10.

Lexical search alone did not reach it. Questions phrased differently from the note ("solved a performance problem" versus a note about p95 latency and caching) were missed, and opinion or study notes outranked the notes that recorded the experience ([S2 report](../testing/career-retrieval-s2-report.md)).

## Decision

Vault search combines:

- lexical search with `bge-m3` embeddings served by the local Ollama, fused with reciprocal rank fusion;
- exclusion of application-question heading chunks from semantic matching; and
- a judgement by the local chat model, per candidate note, of whether the note records something the user did.

This is the default (`semanticSearch: true`). Changed notes are indexed in the background after startup and before each career run, and the index is stored in the plugin folder. Without the embedding model, search falls back to lexical and the settings screen shows why. Everything in this path runs on the local provider; no Vault content leaves the machine for retrieval.

## Consequences

- On the 60-question real-notes judgement set (2026-10-08) all four targets passed: recall@3 0.85, block rate 0.95, wrongly blocked 0.00, non-experience first 0.03.
- In the full-flow evaluation on the synthetic Vault, the right evidence was found 1.00 of the time, against about 0.56 with keywords only.
- Search slowed from about 0.1 s to about 3.4 s per question because of the judge. The `search_vault` timeout was raised to 30 s; a busy model can still exceed it.
- Users need `bge-m3` pulled in Ollama for the full quality.
- This is the clearest place where a local model earns its place: every candidate in the whole Vault is judged on every run, which is impractical to send to a paid or remote model.
