---
status: accepted
---

# Personalize from user-selected writing and evaluated preferences

## Context

Fathomark promises to help users extend Obsidian notes with evidence-backed drafts in the user's intended writing style, while keeping Vault content and note changes under user control. The earlier evaluation discussion exposed several problems with the initial framing:

- Scanning whole documents or the Vault to infer a style can collect irrelevant material, including factual notes, quotations, and text copied from AI output.
- Treating the rule that Vault facts must never enter a style adapter as absolute conflicts with the product's exploration of user-directed, per-user LoRA personalization. A selected style passage can contain facts, so ignoring that possibility does not resolve it.
- Combining style preference and factual accuracy in one score could let fluent prose compensate for unsupported claims or altered facts.
- Updating an active adapter immediately after one preference choice would provide no evidence of generalization and could introduce regressions.
- Some earlier discussion treated proposed documentation as a fixed constraint instead of evaluating it against the evolving product goal.

The user has decided that text they explicitly select represents their intended style. Existing documentation remains a working design record and may evolve when a better-supported direction serves the product promise.

## Decision

Fathomark will pursue user-selected, local-first personalization, with prompting and retrieval-based examples as a non-training baseline and user-specific LoRA as an optional candidate when evaluation demonstrates benefit.

- Do not scan the Vault to infer a style reference. Treat an explicitly selected text passage as the user's declared style target.
- Compare personalization methods on the same request, evidence, base model, and generation settings. Vary only the personalization method, randomize response order, and hide method identity during preference selection.
- Evaluate evidence grounding, factual preservation, conflict handling, and harness safety separately from style preference. A response that fails grounding or safety checks is not eligible for style preference comparison.
- Collect pairwise preferences as evaluation signals. A preference choice alone does not update the active adapter.
- Train a local candidate adapter only as an explicit personalization path. Evaluate it on held-out requests and evidence that were not used to train it, including checks for unsupported recall of facts from selected style material.
- Apply a candidate only after it passes the agreed evaluation gates and the user chooses to use it. Preserve a path to return to the previous personalization state.
- Keep selected material, preferences, and user-specific adapters on-device by default. Do not treat an adapter as a substitute for retrieving and citing current Vault evidence.

## Consequences

This direction uses the user's selection as an explicit relevance signal instead of relying on automatic authorship detection or whole-Vault inference. It supports a progression from prompt and example-based personalization to LoRA only when the user's data and measured results justify the added training workflow.

Selected passages may still contain facts or copied text. Selection establishes the desired style target, not a guarantee that the passage is fact-free or originally authored by the user. Evaluation must therefore distinguish stylistic generalization from reproducing source content. This is a risk to measure and control, not a reason to treat the earlier prohibition as immutable.

The decision does not yet set scoring rubrics, minimum preference volume, statistical thresholds, adapter training objective, detailed retention and deletion UX, or hardware requirements. Those remain open and must be resolved before implementation of the training and update workflow.

## Rejected alternatives

- Infer style by scanning all Vault documents — rejected because it broadens data collection and introduces irrelevant, quoted, or AI-copied text as uncontrolled style material.
- Permanently prohibit LoRA for personal style — rejected because it rules out a user-directed personalization path before comparing it with lighter methods.
- Update the active adapter after each preference selection — rejected because one pair does not establish generalization or absence of regressions.
- Use one aggregate quality score — rejected because style preference must not offset failures in factual grounding, conflict handling, or safety.
