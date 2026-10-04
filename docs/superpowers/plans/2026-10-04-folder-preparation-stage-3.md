# Folder Preparation Stage 3 Implementation Plan

**Goal:** Add `train-prepared`, which revalidates a Stage 2 approval seal, converts only approved style and fact data into supervised datasets, trains and evaluates one private LoRA candidate, and stops at `pending_quality_review`.

**Boundary:** This stage does not activate an adapter in the plugin, invent a global model registry, or claim that automatic diagnostics establish semantic quality. ADR 0006 leaves provider activation, rollback, background execution, and hardware policy unresolved. Existing human quality review and method-blind comparison artifacts remain the next gate.

## Command

```text
train-prepared --run-dir PATH [training options] [--dry-run]
```

- Use the base model and revision recorded by `prepare-folder`; do not accept a model override.
- A dry run verifies the current source corpus, Stage 1 inputs, Stage 2 bundle, exact split coverage, and disjoint datasets without loading a model or writing files.
- A real run moves through `approved_for_training -> training -> pending_quality_review`.

## Approved-data transformation

- Render the approved four-category style profile in one deterministic fixed order.
- Use only approved fact statements as `source_text`; never expose `source_passage`, evidence spans, or source paths to generation prompts.
- Use the immutable Stage 1 `source_passage` only as the train/validation `target_text`.
- Produce schema-v2 evaluation cases whose expected facts are approved statements and whose literal facts are the stable union of recomputed required literals.
- Preserve train/validation/evaluation splits and reject missing, duplicate, empty, or overlapping partitions.
- Fail the entire run when any approved example exceeds token limits; never silently drop approved data.

## Trust and publication

- Re-run Stage 2 bundle verification, current-source manifest validation, draft-input hashing, and normalized approved-artifact comparison before model load and again before publication.
- Bind the candidate metadata and a private `training-input.json` to the exact approval hash, source manifest, model revision, hyperparameters, and split counts.
- Train under `<run-dir>/.candidate.training`, add diagnostic-only training-recall checks, seal every candidate file, set private permissions, then atomically rename to `candidate/`.
- Update `run.json` only after the complete candidate is public. Recover an interruption after rename by verifying the candidate seal and completing only the missing state transition.
- Identical reruns are idempotent; changed inputs or training settings never overwrite a candidate.

## Automatic diagnostics

- For baseline and LoRA evaluation answers, record hashes of train/validation-only numeric tokens, URLs, and long phrases that appear in an answer but not in that held-out case's approved facts.
- Diagnostics are local, contain no raw training prose, and explicitly set `automatic_checks_establish_quality: false`.
- Candidate metadata remains `active: false`; human quality review is mandatory.

## Files

- Create `model/src/model/training/prepared_training.py` for seal revalidation, deterministic dataset construction, leakage diagnostics, candidate sealing, and verification.
- Modify `model/src/model/training/folder_workflow.py` and `workflow.py` for the command, atomic state machine, recovery, and idempotency.
- Modify `model/src/model/training/workflow.py` so the shared trainer can honor a recorded base revision, suppress staging-path output, and return a summary.
- Add `model/tests/test_prepared_training.py` and extend folder workflow tests.
- Update `model/QUALITY_TRAINING.md` with the implemented Stage 3 command and explicit stop before promotion.

## Acceptance criteria

- `train-prepared --dry-run` loads no model and writes nothing.
- Every Stage 2 hash, permission, provenance, source-drift, and state check runs before model loading.
- Prompt-facing inputs contain approved abstract style plus approved statements only.
- Training and validation use every approved target exactly once; evaluation contains at least three held-out cases and no target text.
- Baseline and LoRA evaluation use identical cases, base model, revision, tokenizer, prompt, and decoding settings.
- Approved rows are never silently filtered for length.
- Candidate publication is private, sealed, atomic, recoverable, and idempotent.
- Automatic recall checks are diagnostic-only and never promote or activate the candidate.
- Success ends at `pending_quality_review`; failure leaves no trusted partial candidate.
- Full model tests, Ruff, TypeScript checks, plugin tests, dependency boundaries, and build pass.

## Deferred decisions

- Reviewer-neutral quality-review identity mapping and exact preference-finalization command.
- Global candidate registry, plugin/provider adapter loading, activation, and rollback.
- Background execution/cancellation UI, VRAM support matrix, quantization, and real-user/GPU benchmarks.
