---
status: accepted
---

# Personalize from user-selected writing and evaluated preferences

> Amended by [ADR 0007](./0007-grounded-career-writing-with-hosted-models.md). The LoRA candidate path, the folder-preparation and training steps, and the first-run onboarding sequence are removed. The remaining rules — user-selected material as the style target, factual grounding evaluated separately from style preference, and method-blind comparison — still apply.

## Context

Fathomark promises to help users extend Obsidian notes with evidence-backed drafts in the user's intended writing style, while keeping Vault content and note changes under user control. The earlier evaluation discussion exposed several problems with the initial framing:

- Scanning whole documents or the Vault to infer a style can collect irrelevant material, including factual notes, quotations, and text copied from AI output.
- Treating the rule that Vault facts must never enter a style adapter as absolute conflicts with the product's exploration of user-directed, per-user LoRA personalization. A selected style passage can contain facts, so ignoring that possibility does not resolve it.
- Combining style preference and factual accuracy in one score could let fluent prose compensate for unsupported claims or altered facts.
- Updating an active adapter immediately after one preference choice would provide no evidence of generalization and could introduce regressions.
- Some earlier discussion treated proposed documentation as a fixed constraint instead of evaluating it against the evolving product goal.

The user has decided that text they explicitly select represents their intended style. Existing documentation remains a working design record and may evolve when a better-supported direction serves the product promise.

## Decision

Fathomark will pursue user-selected personalization through prompting and retrieval-based examples of the user's own writing. No per-user model training is part of the product.

- Do not scan the Vault to infer a style reference. Treat an explicitly selected text passage as the user's declared style target.
- Compare personalization methods on the same request, evidence, base model, and generation settings. Vary only the personalization method, randomize response order, and hide method identity during preference selection.
- Evaluate evidence grounding, factual preservation, conflict handling, and harness safety separately from style preference. A response that fails grounding or safety checks is not eligible for style preference comparison.
- Collect pairwise preferences as evaluation signals; a single preference choice does not change the saved style selection.
- Apply a style selection only after the user chooses it, and keep a path to return to the previous one.
- Keep selected material and preferences in the user's Vault or plugin data. Style examples are never a substitute for retrieving and citing current Vault evidence; sending any of this to a hosted provider requires the consent described in ADR 0007.

## Consequences

This direction uses the user's selection as an explicit relevance signal instead of relying on automatic authorship detection or whole-Vault inference. It keeps personalization to prompt and example-based methods.

Selected passages may still contain facts or copied text. Selection establishes the desired style target, not a guarantee that the passage is fact-free or originally authored by the user. Evaluation must therefore distinguish stylistic generalization from reproducing source content; the one training experiment run under this ADR failed exactly that check. This is a risk to measure and control, not a reason to treat the earlier prohibition as immutable.

The decision does not yet set the detailed objective-review workflow or the style-example selection experience.

## Rejected alternatives

- Infer style by scanning all Vault documents — rejected because it broadens data collection and introduces irrelevant, quoted, or AI-copied text as uncontrolled style material.
- Per-user LoRA training — tried and rejected (ADR 0007): the candidate reproduced training text instead of using the supplied facts.
- Use one aggregate quality score — rejected because style preference must not offset failures in factual grounding, conflict handling, or safety.
