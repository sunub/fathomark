---
status: proposed
---

# Curate evidence locally and draft with the user's Codex CLI

> Proposed on 2026-10-12. It becomes `accepted` only after the A/B check in [DIRECTION.md](../DIRECTION.md) ("구현 전 검증") passes. Until then [ADR 0007](./0007-grounded-career-writing-with-hosted-models.md) stands. If accepted, it amends ADR 0007 and the provider note in [ADR 0002](./0002-plugin-contained-agent-harness.md).

## Context

ADR 0007 made model providers replaceable, assumed a hosted provider would use the user's own API key, and concluded that "no capability the product needs depends on a local model". Building the workflow on local `gemma4:e4b` then showed two things:

- The local model is weak exactly where the product's visible output is: Korean long-form drafting. Strict grounding pushed drafts toward restating the notes, and the meaning check still wrongly blocks 0.28 of acceptable drafts.
- The local model is strong where a remote model is impractical: judging every candidate note on every run (ADR 0009), and handling Vault content without sending it anywhere.

A local model therefore earns its place through constraints, not capability: content that should not leave the machine, and work that must run over the whole Vault repeatedly. The intended way to raise writing quality was always the user's Codex subscription, not an API key.

## Decision (proposed)

- **The local model curates and checks.** It searches and judges the Vault, selects the smallest set of evidence the request needs, and verifies the returned draft claim by claim against that evidence.
- **Codex CLI drafts.** When the user is signed in to Codex, Fathomark runs the user's own `codex exec` as a child process and sends only the selected evidence and the request. Fathomark never reads, copies, or stores Codex credentials.
- **Consent before egress.** Each request shows what will be sent before it leaves the machine (the S7 consent gate becomes a required path).
- **Local drafting is the fallback.** Without a Codex subscription, the local model also drafts. When Codex reaches a usage limit, Fathomark offers the switch instead of switching automatically.
- Claude subscription CLIs are not used.

Codex CLI is a separately installed program the user runs, like Ollama. It is not a product-owned companion process, so ADR 0002 still holds.

## Acceptance check

Compare on the same questions, first on the synthetic Vault:

- **A:** the remote model reads the Vault notes directly and drafts.
- **B:** the local model selects the evidence and the remote model drafts from it.

Record input tokens, bytes and notes sent off the machine, the rate at which needed evidence is missing, blind-compared draft quality, and fabricated claims. Fix the pass line before measuring. Accept this ADR if B keeps quality comparable to A while sending substantially less.

## Risks

- Whether a distributed app may invoke a user's signed-in `codex exec` was judged ambiguous on 2026-10-05; the OpenAI terms were not checked in the original ([subscription-cli-providers.md](../research/subscription-cli-providers.md)). This must be resolved before public release.
- Each `codex exec` call carries a large fixed input: about 27,000 tokens for "ok", about 18,000 with an empty `CODEX_HOME` (measured 2026-10-05). It can hide the savings from sending less evidence, so the fixed and evidence parts are recorded separately and steps are batched into few calls.
- Draft quality is bounded by local selection: recall@3 is 0.85 on the real-notes set.
- The selected evidence is still personal data leaving the machine. The benefit is sending the minimum, not keeping everything local.
