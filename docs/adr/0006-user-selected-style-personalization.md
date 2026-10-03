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

### First-run personalization experience

Personalization is an optional, one-time onboarding path rather than work the user repeats whenever the plugin starts. A user can defer it and continue with the unpersonalized base model.

When the user chooses **Personalize to my writing style**, the product guides them through this sequence:

1. Select the local folder that contains the writing they intentionally provide for personalization.
2. Generate one folder-level, fact-free style profile and complete factual statements from the selected writing.
3. Pause before training so the user can review and edit the style profile and every factual statement. Training uses only approved preparation data.
4. Train the candidate and run objective quality checks in the background.
5. Show at least three method-blind style comparisons only when the candidate answers have passed the independent quality gates. The style gate requires the LoRA candidate to win a strict majority of valid votes; `no_difference` is neutral and `neither` records a failed comparison.
6. Store the candidate as the user's approved model only when it passes both the quality gate and the user's style-preference gate.

The selected writing folder may contain an explicit `evaluation/` subdirectory for new user-authored held-out documents. Those documents represent the same user's intended style, but they are excluded from style-profile generation, training, and validation. They are used only to evaluate whether the candidate generalizes to unseen writing.

Failed and superseded runs remain on-device as reviewable records; they are not promoted to the approved personalization state. The plugin reuses the approved candidate across launches. It starts a new personalization run only when the user requests one or when an input that determines compatibility changes, such as the selected writing set, approved style profile, or base model.

## Consequences

This direction uses the user's selection as an explicit relevance signal instead of relying on automatic authorship detection or whole-Vault inference. It supports a progression from prompt and example-based personalization to LoRA only when the user's data and measured results justify the added training workflow.

Selected passages may still contain facts or copied text. Selection establishes the desired style target, not a guarantee that the passage is fact-free or originally authored by the user. Evaluation must therefore distinguish stylistic generalization from reproducing source content. This is a risk to measure and control, not a reason to treat the earlier prohibition as immutable.

The decision does not yet set the detailed objective-review workflow, adapter training objective, onboarding UI layout, background execution boundary, or hardware requirements. Those remain open and must be resolved before implementation of the training and update workflow.

## Rejected alternatives

- Infer style by scanning all Vault documents — rejected because it broadens data collection and introduces irrelevant, quoted, or AI-copied text as uncontrolled style material.
- Permanently prohibit LoRA for personal style — rejected because it rules out a user-directed personalization path before comparing it with lighter methods.
- Update the active adapter after each preference selection — rejected because one pair does not establish generalization or absence of regressions.
- Use one aggregate quality score — rejected because style preference must not offset failures in factual grounding, conflict handling, or safety.
