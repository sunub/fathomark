# Folder Preparation Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `prepare-folder` command that creates reviewable, fact-free style and grounded fact drafts, then stops at `pending_preparation_review` without starting LoRA training.

**Architecture:** Keep the existing `train-folder` path unchanged during this stage. Add an explicit preparation path that separates an `evaluation/` subtree before any split, derives one folder-level style profile from training documents only, records complete factual statements with exact supporting spans, and writes immutable draft artifacts into a new run directory. Stage 2 approval and Stage 3 training are out of scope.

**Tech Stack:** Python 3.12, standard library dataclasses/JSON/hashlib/pathlib, existing PyTorch/Transformers model loader, unittest, Ruff. No new dependency.

**Spec:** `docs/adr/0006-user-selected-style-personalization.md:19-46` and the approved Stage 1 design in the 2026-10-03 conversation.

## Global Constraints

- Work only in `model/` plus this plan's documentation update; do not touch the dirty plugin files or generated/personal data under `model/fathomark-runs/` and `model/fathomark-writing/`.
- Do not scan the Vault. Read only the folder explicitly supplied through `--input-dir`.
- Treat `<input-dir>/evaluation/` as the only evaluation source; exclude it from style profiling, training, and validation before deduplication or splitting.
- Write drafts only. Do not create `candidate/`, inject LoRA, call `fit_candidate`, generate baseline/candidate answers, or claim semantic approval.
- Keep existing `train-folder` behavior and tests working until later stages replace its orchestration.
- Do not add dependencies. Reuse `Document`, `_normalize`, the current local model loader, and current JSONL conventions.
- Draft outputs may contain private writing and remain local. Do not log source text to stdout.

## Review Focus

1. A document duplicated between the normal tree and `evaluation/` must fail preparation rather than be silently deduplicated into one side.
2. An `evaluation/` symlink or a symlink below it must never become an accepted evaluation document.
3. A style observation containing an original URL, digit, code, or long source phrase must be rejected before it contributes to the aggregate profile.
4. A fluent factual statement with a fabricated or non-literal evidence span must be skipped and reported, never accepted because it sounds plausible.
5. A failed or interrupted preparation must not leave `pending_preparation_review`, a candidate directory, or a partially valid draft set.

---

## Stage Boundary and Artifacts

This plan completes only the first of the three approved commands:

```text
prepare-folder                 ← this plan
approve-preparation            ← later plan
train-prepared                 ← later plan
```

Successful output:

```text
<run-dir>/
├── run.json
├── preparation.json
├── style-profile.draft.json
├── facts.draft.jsonl
└── automatic-checks.json
```

`run.json.status` must be `pending_preparation_review`. No approved artifact or model candidate is created in this stage.

## File Structure

- Modify `model/src/model/training/corpus.py`: allow the caller to exclude the explicit `evaluation/` subtree without reading and deduplicating it into the main corpus.
- Modify `model/src/model/training/folder_data.py`: define draft profile/fact types, explicit train/validation/evaluation partitioning, extraction, validation, and aggregation.
- Modify `model/src/model/training/folder_workflow.py`: register and execute `prepare-folder`, write the five Stage 1 artifacts, and stop before training.
- Modify `model/src/model/training/workflow.py`: keep command registration routed through the existing training CLI.
- Modify `model/tests/test_corpus.py`: protect excluded-directory and symlink behavior.
- Modify `model/tests/test_folder_data.py`: protect style/fact schemas and automatic rejection rules.
- Modify `model/tests/test_folder_workflow.py`: protect CLI state, artifacts, failure behavior, and absence of training.
- Modify `model/QUALITY_TRAINING.md`: document only the Stage 1 command, directory convention, artifacts, and current stop point.

### Task 1: Isolate the explicit evaluation corpus before splitting

**Files:**
- Modify: `model/src/model/training/corpus.py:24-77`
- Modify: `model/src/model/training/folder_data.py:28-46`
- Test: `model/tests/test_corpus.py`
- Test: `model/tests/test_folder_data.py`

**Interfaces:**
- Produce: `load_documents(folder: Path, *, excluded_relative_dirs: frozenset[str] = frozenset()) -> list[Document]`
- Produce: `split_preparation_documents(training_documents: list[Document], evaluation_documents: list[Document], seed: int = 42) -> dict[str, list[Document]]`
- Preserve: existing `load_documents(folder)` callers and the current `Document(path, text, sha256)` representation.

- [ ] **Step 1: Write failing corpus tests for evaluation exclusion**

Add tests asserting that:

- `load_documents(root, excluded_relative_dirs=frozenset({"evaluation"}))` returns root documents but no path equal to or below `evaluation/`.
- a real `evaluation/` directory can be loaded separately with paths relative to that directory.
- evaluation documents are rebased before partitioning so their stored paths remain relative to the selected root (for example, `evaluation/new-topic.md`, not `new-topic.md`).
- an `evaluation` symlink and symlinked files below a real evaluation directory are excluded under the existing no-symlink policy.
- hidden directories remain excluded.

- [ ] **Step 2: Run the focused corpus tests and confirm the new keyword argument is not implemented**

Run: `cd model && .venv/bin/python -m unittest tests.test_corpus -v`

Expected: FAIL because `load_documents` does not accept `excluded_relative_dirs`.

- [ ] **Step 3: Extend `load_documents` without weakening current traversal rules**

Resolve excluded paths relative to the selected root, prune matching directory subtrees before reading their files, and keep the current hidden-path, UTF-8, extension, regular-file, symlink, deterministic-order, and exact-content deduplication behavior for all non-excluded documents. When the workflow loads `evaluation/` separately, rebuild its immutable `Document` records with an `evaluation/` path prefix so every manifest path stays relative to the user-selected root.

- [ ] **Step 4: Write failing partition tests**

Add `split_preparation_documents` tests asserting that:

- normal documents become deterministic train/validation splits and explicit evaluation documents remain evaluation documents;
- at least two distinct non-evaluation documents and one distinct evaluation document are required;
- exact or normalized duplicate content across any two splits raises `ValueError` rather than dropping one copy;
- changing only `seed` may change train/validation membership but never evaluation membership.

- [ ] **Step 5: Run the focused partition tests and confirm the function is missing**

Run: `cd model && .venv/bin/python -m unittest tests.test_folder_data -v`

Expected: FAIL because `split_preparation_documents` is not defined.

- [ ] **Step 6: Implement explicit partitioning**

Implement `split_preparation_documents` in `folder_data.py`. Reuse the existing normalization and deterministic sorting patterns, but reject cross-group duplicates before applying a seeded train/validation split. Do not reuse the current three-way random `split_folder_documents` for the new command.

- [ ] **Step 7: Run Task 1 tests**

Run: `cd model && .venv/bin/python -m unittest tests.test_corpus tests.test_folder_data -v`

Expected: PASS.

- [ ] **Step 8: Commit Task 1 using the repository commit protocol**

Use the `commit` skill. Stage only the Task 1 source and test files; do not stage generated or personal files.

### Task 2: Produce reviewable style-profile and fact drafts

**Files:**
- Modify: `model/src/model/training/folder_data.py:15-25,49-217`
- Test: `model/tests/test_folder_data.py`

**Interfaces:**
- Produce immutable dataclasses:
  - `StyleProfile(tone: tuple[str, ...], organization: tuple[str, ...], sentence_style: tuple[str, ...], formatting: tuple[str, ...])`
  - `FactStatement(statement: str, evidence_spans: tuple[str, ...], required_literals: tuple[str, ...])`
  - `FactDraft(id: str, split: str, source_document: dict[str, str], passage_index: int, source_passage: str, facts: tuple[FactStatement, ...], target_text: str | None)`
  - `PreparedFolderDraft(style_profile: StyleProfile, style_sources: tuple[dict[str, str], ...], facts: tuple[FactDraft, ...], skipped: tuple[dict[str, object], ...], automatic_checks: tuple[dict[str, object], ...])`
- Produce: `prepare_folder_draft(splits: dict[str, list[Document]], extract: Callable[[str], str], max_chars: int = 1200) -> PreparedFolderDraft`
- Preserve: legacy `prepare_folder_data` behavior for `train-folder` during Stage 1.

- [ ] **Step 1: Write failing style-profile tests**

Use deterministic fake extractor responses and assert that:

- only `train` documents are sent to style observation prompts;
- each accepted response has exactly the four profile categories and nonblank string arrays;
- observations containing `https://`, any decimal digit, fenced/inline code, or a normalized source overlap of four or more consecutive whitespace-delimited tokens with at least 24 characters are rejected and recorded in `automatic_checks`;
- at least two distinct training documents must contribute accepted observations;
- the aggregate profile keeps the eight most frequent unique normalized items per category, with normalized text as the deterministic tie-breaker;
- validation and evaluation text never appears in the serialized profile or style-source manifest.

- [ ] **Step 2: Run the focused style tests and confirm the draft API is missing**

Run: `cd model && .venv/bin/python -m unittest tests.test_folder_data.FolderDataTest -v`

Expected: FAIL because the Stage 1 dataclasses and `prepare_folder_draft` are not defined.

- [ ] **Step 3: Implement style observation parsing, validation, and aggregation**

For every passage from every training document, request JSON containing `tone`, `organization`, `sentence_style`, and `formatting`. Treat source text as untrusted JSON-quoted data. Reject a complete observation if any field violates the automatic checks. Aggregate accepted items by normalized frequency; do not make a second model call over raw documents or copy exemplar sentences into the final profile.

- [ ] **Step 4: Write failing grounded-fact tests**

Fake extractor output must use this shape:

```json
{
  "facts": [
    {
      "statement": "페이지의 LCP는 5.3초로 측정되었다.",
      "evidence_spans": ["LCP 5.3초"]
    }
  ]
}
```

Assert that:

- every statement is trimmed, nonblank, and ends in `.`, `?`, or `!`;
- every evidence span is a unique, nonblank, exact substring of `source_passage`;
- every digit-bearing source token appears verbatim in both an evidence span and one associated statement;
- `required_literals` is derived by the program from accepted digit-bearing evidence rather than trusted from model output;
- fabricated evidence, duplicate facts, missing numeric context, malformed JSON, and full-passage copy tasks are skipped with stable reasons;
- train/validation drafts retain `target_text`, while evaluation drafts set `target_text` to `None`;
- each draft keeps source path/hash, passage index, split, source passage, and a stable content-derived ID;
- normalized passages and normalized statement sets cannot repeat across splits;
- fewer than three accepted evaluation drafts makes the whole draft invalid, matching the already-approved minimum blind-comparison volume.

- [ ] **Step 5: Run the focused fact tests and confirm they fail**

Run: `cd model && .venv/bin/python -m unittest tests.test_folder_data.FolderDataTest -v`

Expected: FAIL on the new grounded-statement expectations.

- [ ] **Step 6: Implement grounded fact drafts and cross-split validation**

Use a separate fact-extraction prompt from the style prompt. Preserve the existing protections against malformed output, duplicate evidence, near/full target copying, numeric omission, and cross-split duplicates, adapted to `FactStatement`. Automatic checks establish structure and literal support only; they must not mark semantic review approved.

- [ ] **Step 7: Run Task 2 tests**

Run: `cd model && .venv/bin/python -m unittest tests.test_folder_data -v`

Expected: PASS, including all legacy folder-data tests.

- [ ] **Step 8: Commit Task 2 using the repository commit protocol**

Use the `commit` skill. Stage only `folder_data.py` and its tests.

### Task 3: Add the prepare-only CLI and durable draft artifacts

**Files:**
- Modify: `model/src/model/training/folder_workflow.py:20-46,92-205`
- Modify: `model/src/model/training/workflow.py:24-27`
- Modify: `model/tests/test_folder_workflow.py:13-176`
- Modify: `model/QUALITY_TRAINING.md:1-70`

**Interfaces:**
- Produce command:
  - `prepare-folder --input-dir PATH --output-dir PATH [--model NAME] [--device cpu|cuda|mps] [--max-chars N] [--extraction-tokens N] [--seed N] [--dry-run]`
- Consume: `load_documents(..., excluded_relative_dirs=...)`, `split_preparation_documents(...)`, and `prepare_folder_draft(...)` from Tasks 1-2.
- Produce the five Stage 1 artifacts exactly as listed in the Stage Boundary section.

- [ ] **Step 1: Write failing command and dry-run tests**

Assert that:

- `prepare-folder --dry-run` requires only the selected folder, reports normal/evaluation document counts, does not load a model, and writes nothing;
- a missing, empty, symlinked, or nested-output `evaluation/` arrangement fails before model loading;
- an existing or input-nested output directory is rejected before model loading;
- the command accepts only positive `max-chars` and `extraction-tokens` values.

- [ ] **Step 2: Run the focused CLI tests and confirm the command is absent**

Run: `cd model && .venv/bin/python -m unittest tests.test_folder_workflow -v`

Expected: FAIL because `prepare-folder` is not registered.

- [ ] **Step 3: Register `prepare-folder` without changing `train-folder` arguments**

Keep the existing `add_folder_command` routing compatible or rename it consistently across its only caller. The new parser must not expose epochs, learning rate, rank, alpha, or generation settings because Stage 1 cannot train or evaluate a candidate.

- [ ] **Step 4: Write failing successful-run artifact test**

With a fake local model/extractor, assert that a successful command writes:

- `run.json` with `status: "pending_preparation_review"`, the command inputs, and no candidate path;
- `preparation.json` with schema version, source manifests, accepted counts, skipped items, extraction model/revision, and `semantic_review: "pending"`;
- `style-profile.draft.json` with `schema_version: 1`, `status: "pending_review"`, source hashes, and the four profile categories;
- `facts.draft.jsonl` with exactly one valid JSON object per line and the Task 2 schema;
- `automatic-checks.json` with all accepted/rejected automatic checks and `automatic_checks_establish_semantic_approval: false`;
- no `candidate/`, approved file, evaluation result, adapter, or training call.

Patch `fit_candidate`, LoRA injection, and trainer entry points to raise if called, proving preparation stops before training.

- [ ] **Step 5: Write failing failure-state and publication tests**

Assert that:

- output starts with `run.json.status == "preparing"`;
- extractor/schema/validation failure ends with `run.json.status == "preparation_failed"` and an error message;
- draft files are written through temporary sibling paths and only published after the complete artifact set validates;
- failure never leaves `pending_preparation_review` or a partial final draft set;
- stdout reports paths and counts but never source passages or profile contents.

- [ ] **Step 6: Implement `prepare_folder(args)` and artifact serialization**

Reuse the current model loader and deterministic `generate_text` extraction pattern, but do not construct `TrainConfig`, filter tokenizer lengths for supervised training, call `ensure_disjoint` over supervised examples, or call `fit_candidate`. Serialize with `allow_nan=False`, newline-terminated JSON, stable JSONL ordering, and atomic temporary-file replacement inside the new output directory.

- [ ] **Step 7: Update Stage 1 documentation only**

Document the `evaluation/` convention, command example, five artifacts, privacy warning, automatic-check limitations, and the explicit stop at `pending_preparation_review`. State that approval and training commands are not implemented by this stage; do not document them as available.

- [ ] **Step 8: Run Task 3 tests**

Run: `cd model && .venv/bin/python -m unittest tests.test_folder_workflow -v`

Expected: PASS, including legacy `train-folder` tests.

- [ ] **Step 9: Run the complete model verification**

Run: `cd model && .venv/bin/python -m unittest discover -s tests -v && .venv/bin/ruff check . && .venv/bin/ruff format --check .`

Expected: all model tests pass; Ruff reports no lint or formatting errors.

- [ ] **Step 10: Run repository verification**

Run: `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build`

Expected: all four commands pass. Existing unrelated dirty files remain unstaged and unchanged.

- [ ] **Step 11: Commit Task 3 using the repository commit protocol**

Use the `commit` skill and Lore trailers. Include exact test evidence and any known real-model gap; stage only Stage 1 source, tests, docs, and this plan.

## Acceptance Criteria

- [ ] `prepare-folder` completes a run at `pending_preparation_review` and never starts training.
- [ ] The explicit `evaluation/` subtree is excluded before normal corpus deduplication and remains evaluation-only.
- [ ] The style profile is one folder-level, fact-free abstraction derived only from training documents.
- [ ] Facts are complete draft statements bound to exact source spans and program-derived numeric literals.
- [ ] At least two training documents contribute to the style profile and at least three evaluation fact drafts survive automatic checks.
- [ ] URL, digit, code, and long-phrase profile leakage produces recorded automatic failures.
- [ ] Cross-split document, passage, and fact duplication is rejected.
- [ ] Every final artifact is valid, newline-terminated JSON/JSONL and is published only as a complete set.
- [ ] Failure leaves an auditable `preparation_failed` run without final drafts or candidate artifacts.
- [ ] Existing `train-folder` behavior remains covered and passing.
- [ ] Full model and repository verification commands pass.

## Risks and Mitigations

- **Model returns fluent but semantically wrong facts:** require exact evidence spans and keep semantic status pending for Stage 2 user review.
- **Korean proper nouns evade deterministic classification:** block URLs, digits, code, and long overlap automatically; retain source-linked user review rather than claiming automatic fact-free proof.
- **Folder-scale profiling exceeds model context:** analyze bounded passages independently and aggregate normalized observations by frequency; never concatenate the full corpus into one prompt.
- **Evaluation content leaks through corpus deduplication:** exclude the subtree before reading the normal corpus and reject duplicates across the separately loaded groups.
- **Stage 1 accidentally triggers expensive training:** omit all training options from the command and add tests whose patched training entry points fail if invoked.
- **Partial writes look reviewable after interruption:** publish a validated artifact set atomically and reserve `pending_preparation_review` for complete output only.

## Verification Summary

Stage 1 is complete only when focused TDD cycles pass, the full Python suite and Ruff checks pass, the repository-wide TypeScript checks pass, and a CLI test proves no training/candidate code ran. Real personal documents and real Qwen inference are not required for this stage's automated verification; that gap must remain explicit in the final report.

## Deferred Follow-ups

- Stage 2: `approve-preparation`, reviewed-file validation, source/hash sealing, and `approved_for_training`.
- Stage 3: `train-prepared`, automatic answer leakage diagnostics, reviewer-neutral quality review, blind style preference, and candidate promotion.
- Plugin onboarding UI and actual `my-style-v3` training remain deferred by user request.
