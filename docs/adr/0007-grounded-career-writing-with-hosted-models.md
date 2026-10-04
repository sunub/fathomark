---
status: accepted
---

# Ground career writing in the user's notes with any capable model

Fathomark's first concrete job is **career writing**: turning a job posting or an application question into resume bullets and essay answers that use the user's own experience, recorded in their Vault, and read like the user's own writing. The product value is the harness around the model — finding the right experience, citing it, refusing to invent it, and applying changes only after approval — not a model Fathomark trains or hosts.

## Context

Two needs motivated the product: an assistant that **knows the user's experience** without manual copy-and-paste, and output that **sounds like the user**. Experiments run against the earlier direction (ADR 0003, ADR 0006) showed that neither needs model training and that the training path was a poor fit:

- A user-specific LoRA candidate trained on a small writing folder with a 1.7B local model was rejected in its only evaluation. Two of three held-out cases reproduced the style sample's own title and code and ignored the supplied facts; the third kept the facts but barely changed the wording. The prompted baseline from the same small model also dropped numbers or added unsupported claims. Blind comparison never ran because no candidate passed the quality gates.
- Preparing training data required a model to extract exact quotations and numbers from long Korean technical notes. At a 1.7B scale that step failed on most passages until its validation was relaxed, and even then the style profile was generic and appeared to include phrases copied from the prompt's own example.
- Hosted assistants that rewrite text in a chosen tone use general large models and fixed tone presets; none of the sources reviewed reported per-user training. Training a model per user is therefore not a requirement for the capability the product wants.
- The writing folder used for those experiments was mostly technical study notes. Resumes and application essays are a different genre, so those results say little about the real task.
- A manual trial with a large model, using notes found by keyword search, produced a draft in which every claim traced to a note; whether its voice is acceptable is still the user's judgment. The trial also showed the real risks: retrieval ranking (opinion essays mentioned the topic far more often than the notes that actually recorded the experience) and experience the notes do not contain.

The earlier local-first default was justified by cost and privacy, but no capability the product needs depends on a local model, and in the trials the small local models produced unsupported or incomplete output.

## Decision

Fathomark will be a **provider-agnostic, evidence-grounded career-writing workflow** inside Obsidian.

- **Fixed-step workflow, not an open agent loop.** The default run is: take a posting or question → retrieve candidate experience from the Vault → select and cite evidence → draft in the user's style → verify that every claim has a source → preview → explicit approval. The model performs the step it is given; the harness owns the sequence, budgets, and permissions.
- **Retrieval is the critical risk and comes first.** The existing lexical Vault search is the starting point. It must be evaluated on real application questions, prefer structured experience notes over opinion or study notes, and report when the Vault has no supporting note instead of letting the model fill the gap.
- **Every drafted claim carries an Evidence Reference, or is marked as unsupported.** A claim about the user's experience that no note supports must not be presented as fact.
- **Style comes from the user's own selected writing used as examples, plus an optional fact-free style profile.** No model training is required. The user chooses which writing represents the target genre (for example, past application essays for essay answers and a resume note for bullets); the Vault is not scanned to infer a style.
- **Model providers are replaceable.** A user may choose a hosted provider with their own API key or a local provider. Sending Vault content to a hosted provider requires explicit consent that shows what will be sent. Local execution stays a supported option for users who prefer it, with its measured limits documented, but it is no longer the default policy or the basis of the default-model gates.
- **LoRA and the Python training workspace are removed from the product path.** The existing `model/` directory is kept only as a record of the experiments above. Its evaluation ideas — grounding, preserved numbers, and method-blind comparison with factual checks gating style judgment — carry over to the new workflow.

This decision supersedes ADR 0003 and replaces the LoRA candidate, folder preparation, and first-run training sequences in ADR 0006. ADR 0006's rules that style preference must not offset factual failure, and that user-selected material is the style target, remain in force.

## Consequences

- Plugin users need no Python, GPU, or training step. Quality depends on the chosen model and on retrieval, so the product's measurable work is retrieval selection accuracy, grounding, and style preference on real application questions.
- Vault content may leave the machine when a hosted provider is chosen. Consent, per-request visibility, and API-key storage must be designed before any hosted provider ships. ADR 0004 still governs Wikipedia egress.
- Documents that assumed a local default model (latency gates, resident-memory policy, the 16 GB machine baseline) now apply only to the optional local provider.
- Open decisions: the first hosted provider and its contract; the consent and key-storage experience; the retrieval method beyond lexical search; whether resume bullets and essay answers share one flow; the style-example selection experience; and what happens to the `model/` workspace after the experiments are archived.

## Validation before building more

Run the workflow by hand on a few real application questions before extending the plugin: retrieval must surface the right notes, drafts must cite only notes that support them, and the user must judge the voice acceptable. If retrieval or voice fails that check, fix that before adding features.

## Rejected alternatives

- Keep training a per-user LoRA — rejected: no measured benefit, a quality-gate failure, and a heavy setup the product cannot ask of users.
- Keep local small models as the default — rejected: lower output quality with no capability gain, and cost was the only remaining reason.
- A fully autonomous agent loop — rejected for this task: the steps are known, and fixed steps are easier to verify and to cite.
- Infer style by scanning the whole Vault — still rejected (ADR 0006).
