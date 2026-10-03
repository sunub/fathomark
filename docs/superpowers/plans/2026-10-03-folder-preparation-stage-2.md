# Folder Preparation Stage 2 Implementation Plan

**Goal:** Add an `approve-preparation` command that validates user-reviewed style and fact drafts, seals them against the original preparation inputs, and stops at `approved_for_training` without loading or training a model.

**Architecture:** Stage 2 consumes the immutable artifacts produced by `prepare-folder`, plus two explicit user-reviewed files. It revalidates every editable field against current source documents, preserves provenance fields from the Stage 1 draft, publishes one atomic `approved/` bundle, and records content hashes that Stage 3 can verify. It never creates a candidate or evaluates generated answers.

**Tech Stack:** Python 3.12, standard-library dataclasses/JSON/hashlib/pathlib, unittest, Ruff. No new dependency and no model runtime.

**Spec:** `docs/adr/0006-user-selected-style-personalization.md:19-46`, `docs/superpowers/plans/2026-10-03-folder-preparation-stage-1.md`, and the approved `prepare-folder → approve-preparation → train-prepared` workflow.

## Requirements Summary

- Add only the second command: `approve-preparation`.
- Accept one reviewed style profile and one reviewed facts JSONL file.
- Require an explicit approval marker on the profile and every accepted fact row.
- Re-run structural, leakage, literal-evidence, numeric-preservation, duplicate, and split-isolation checks without calling a model.
- Reject source additions, deletions, content changes, symlinks, stale drafts, missing rows, extra rows, and provenance edits.
- Preserve Stage 1 drafts and automatic-check reports unchanged.
- Publish approved files as one local bundle and seal their exact bytes with SHA-256 hashes.
- End at `run.json.status == "approved_for_training"`.
- Do not implement `train-prepared`, LoRA training, answer evaluation, plugin UI, or candidate promotion.

## Global Constraints

- Modify only `model/`, the Stage 2 plan, and the corresponding model documentation.
- Preserve all existing dirty plugin files, generated runs, and personal writing documents.
- Do not scan the Vault or read paths outside the Stage 1 `input_dir`, the selected run directory, and the two explicitly supplied reviewed files.
- Do not call `load_base_model`, `generate_text`, `TrainConfig`, `fit_candidate`, LoRA helpers, or evaluation generation.
- Do not mutate `style-profile.draft.json`, `facts.draft.jsonl`, `preparation.json`, or `automatic-checks.json`.
- Automatic validation still does not prove semantic truth. The explicit user approval markers establish that the user reviewed the accepted material.
- No new dependencies.

## Review Focus

1. A user must not approve a run after any source document was added, removed, replaced, or edited, even when the edited file keeps the same path.
2. A reviewed fact row must not alter its split, source path/hash, passage index, source passage, target text, or ID while appearing to approve only its statements.
3. Missing, duplicate, reordered, or unknown fact IDs must not weaken exact one-to-one review coverage; harmless row order changes may be normalized.
4. An interrupted approval must expose neither a partial `approved/` bundle nor `approved_for_training` state.
5. Re-running the same approval must be idempotent, while a different approval must never overwrite a sealed bundle.

---

## Stage Boundary

```text
prepare-folder                  complete in Stage 1
approve-preparation             this plan
train-prepared                  deferred to Stage 3
```

Stage 2 consumes:

```text
<run-dir>/
├── run.json                         # pending_preparation_review
├── preparation.json
├── style-profile.draft.json
├── facts.draft.jsonl
└── automatic-checks.json

<reviewed-style.json>
<reviewed-facts.jsonl>
```

Stage 2 publishes:

```text
<run-dir>/approved/
├── style-profile.approved.json
├── facts.approved.jsonl
└── approval.json
```

After publication, `run.json` contains:

```json
{
  "status": "approved_for_training",
  "approval_dir": "approved",
  "approval_sha256": "..."
}
```

No `candidate/`, adapter, evaluation output, or activation state is created.

## Reviewed Input Contracts

### Reviewed style profile

The user copies `style-profile.draft.json`, edits only `profile`, and changes `status` to `approved`:

```json
{
  "schema_version": 1,
  "status": "approved",
  "source_documents": [
    {"path": "article-1.md", "sha256": "..."}
  ],
  "profile": {
    "tone": ["차분하고 직접적으로 설명한다"],
    "organization": ["핵심을 먼저 제시한다"],
    "sentence_style": ["짧은 설명문을 사용한다"],
    "formatting": ["필요할 때 목록을 사용한다"]
  }
}
```

`schema_version` and `source_documents` must equal the draft. Profile values may change, but Stage 2 again rejects URLs, digits, code, empty or duplicate items, and long overlap with every Stage 1 training source passage.

### Reviewed facts

The user copies each `facts.draft.jsonl` row, edits only `facts`, and adds `review_status: "approved"`:

```json
{
  "id": "folder-...",
  "split": "train",
  "source_document": {"path": "article-1.md", "sha256": "..."},
  "passage_index": 0,
  "source_passage": "원문 구간",
  "facts": [
    {
      "statement": "페이지의 LCP는 5.3초로 측정되었다.",
      "evidence_spans": ["LCP 5.3초"],
      "required_literals": ["5.3초"]
    }
  ],
  "target_text": "원문 구간",
  "review_status": "approved"
}
```

The command treats `id`, `split`, `source_document`, `passage_index`, `source_passage`, and `target_text` as immutable and compares them with the Stage 1 row. It accepts `required_literals` for convenient draft copying but recomputes the field from the reviewed statement and evidence; the approved output uses the recomputed value. Every Stage 1 fact ID must appear exactly once, and no extra ID is allowed.

## Approval Seal

`approval.json` uses hashes of exact normalized output bytes:

```json
{
  "schema_version": 1,
  "status": "approved_for_training",
  "draft_input_sha256": "...",
  "source_manifest_sha256": "...",
  "style_profile_sha256": "...",
  "facts_sha256": "..."
}
```

- `draft_input_sha256`: length-prefixed digest of the four Stage 1 preparation artifacts, excluding mutable `run.json`.
- `source_manifest_sha256`: canonical JSON digest of the current train/validation/evaluation path and content hashes.
- `style_profile_sha256`: exact bytes of `style-profile.approved.json`.
- `facts_sha256`: exact bytes of `facts.approved.jsonl`.
- `run.json.approval_sha256`: exact bytes of `approval.json`.

Approved files are newline-terminated, JSONL remains one object per line, rows use stable draft-ID order, the `approved/` directory is mode `0700`, and its files are mode `0600` where supported.

## File Structure

- Create `model/src/model/training/preparation_review.py`: reviewed-file parsing, reusable validation, manifest/digest calculation, approved artifact normalization, and sealed-bundle verification.
- Modify `model/src/model/training/folder_data.py:29-333`: expose pure style/fact validators so Stage 1 extraction and Stage 2 review use identical rules.
- Modify `model/src/model/training/folder_workflow.py:26-279`: register and execute `approve-preparation`, reload current sources, atomically publish `approved/`, recover interrupted publication, and update `run.json`.
- Modify `model/src/model/training/workflow.py:282-305`: dispatch the new command.
- Create `model/tests/test_preparation_review.py`: parser, immutable-field, source-manifest, coverage, hash, and idempotency tests.
- Modify `model/tests/test_folder_data.py:100-475`: prove the extracted reusable validators preserve Stage 1 behavior.
- Modify `model/tests/test_folder_workflow.py:87-407`: CLI, no-model, state transition, interruption, and recovery tests.
- Modify `model/QUALITY_TRAINING.md:3-45`: document only the implemented Stage 2 review and approval flow.

## Task 1: Extract reusable deterministic validators

**Files:**
- Modify: `model/src/model/training/folder_data.py:82-240`
- Modify: `model/tests/test_folder_data.py:100-475`

**Interfaces:**
- Produce: `style_profile_from_dict(data: object, source_passages: tuple[str, ...]) -> StyleProfile`
- Produce: `fact_statements_from_rows(rows: object, passage: str) -> tuple[FactStatement, ...]`
- Preserve: `_style_observation(...)`, `_fact_statements(...)`, and all Stage 1 outputs.

- [ ] Add failing tests that call the new pure validators with valid Stage 1-shaped data and expect the same immutable dataclasses produced by extraction.
- [ ] Add failing tests covering URL, digit, inline/fenced code, four-token/24-character source overlap, empty categories, duplicate profile items, malformed fact rows, nonliteral evidence, missing numeric context, repeated statements, and copy-task coverage.
- [ ] Run `cd model && .venv/bin/python -m unittest tests.test_folder_data -v`; confirm failure because the public validators do not exist.
- [ ] Refactor `_style_observation` to parse extractor JSON and delegate all deterministic checks to `style_profile_from_dict`.
- [ ] Refactor `_fact_statements` to parse extractor JSON and delegate all deterministic checks and `required_literals` derivation to `fact_statements_from_rows`.
- [ ] Run the focused tests; require all Stage 1 tests and new validator tests to pass without changing serialized Stage 1 artifacts.
- [ ] Commit tests and implementation in repository-approved commit units.

## Task 2: Validate reviewed preparation and create a sealed model-free bundle

**Files:**
- Create: `model/src/model/training/preparation_review.py`
- Create: `model/tests/test_preparation_review.py`

**Interfaces:**
- Produce immutable dataclass: `ApprovedPreparation(style_profile: StyleProfile, facts: tuple[FactDraft, ...], draft_input_sha256: str, source_manifest_sha256: str)`
- Produce: `review_preparation(run_dir: Path, style_path: Path, facts_path: Path) -> ApprovedPreparation`
- Produce: `approved_artifacts(approved: ApprovedPreparation) -> dict[str, bytes]`
- Produce: `verify_approval_bundle(approved_dir: Path) -> dict[str, object]`
- Consume: the pure validators from Task 1 and the five Stage 1 files.

- [ ] Add failing tests that load a complete Stage 1 fixture and accept an unchanged reviewed profile/facts pair with explicit approval markers.
- [ ] Add failing tests for invalid UTF-8, symlinked run/review files, malformed JSON/JSONL, unsupported schema versions, wrong run command/status, missing Stage 1 artifacts, and altered automatic-check metadata.
- [ ] Add failing exact-coverage tests for missing, duplicate, and unknown fact IDs. Verify reviewed row order is irrelevant and approved output order follows `facts.draft.jsonl`.
- [ ] Add failing immutable-field tests for edits to split, source path/hash, passage index, source passage, target text, style source list, and draft ID.
- [ ] Add failing editable-field tests proving corrected statements and evidence are allowed only when the reusable validators pass; recomputed `required_literals` must replace supplied values.
- [ ] Add failing source-drift tests for added, deleted, renamed, modified, duplicated, and symlinked training/evaluation documents. Recreate the split from `run.json.input_dir`, `run.json.seed`, and current files, then compare the exact canonical manifest with `preparation.json.documents`.
- [ ] Add failing cross-split tests showing reviewed edits cannot create duplicate normalized fact-statement sets across train, validation, or evaluation.
- [ ] Add digest tests proving byte changes in any Stage 1 artifact, approved profile, approved facts, or source manifest change the corresponding seal.
- [ ] Implement strict UTF-8 readers, schema parsers, immutable-field comparison, exact ID coverage, current-source reload, normalized approved artifacts, and length-prefixed SHA-256 digests.
- [ ] Set approved bundle permissions to `0700`/`0600` where supported; permission failure must abort before publication.
- [ ] Run `cd model && .venv/bin/python -m unittest tests.test_preparation_review tests.test_folder_data -v`; require all tests to pass.
- [ ] Commit tests and implementation in repository-approved commit units.

## Task 3: Add the approval CLI, atomic state transition, and documentation

**Files:**
- Modify: `model/src/model/training/folder_workflow.py:26-279`
- Modify: `model/src/model/training/workflow.py:282-305`
- Modify: `model/tests/test_folder_workflow.py:87-407`
- Modify: `model/QUALITY_TRAINING.md:3-45`

**Interfaces:**
- Produce command: `approve-preparation --run-dir PATH --style-profile PATH --facts-file PATH`
- Consume: `review_preparation`, `approved_artifacts`, and `verify_approval_bundle` from Task 2.
- Produce: `<run-dir>/approved/` and `run.json.status == "approved_for_training"`.

- [ ] Add a failing parser test proving the command requires exactly `--run-dir`, `--style-profile`, and `--facts-file`, with no model, device, epoch, rank, or generation arguments.
- [ ] Add a failing successful-run test that patches all model/training entry points to raise if called, approves a complete fixture, and verifies the three sealed files, file modes, hashes, status, and content-free stdout summary.
- [ ] Add failing state tests for `preparing`, `preparation_failed`, unknown future states, absent run directory, run-directory symlink, and an already sealed but inconsistent run.
- [ ] Add a failing atomic-publication test: build files under `<run-dir>/.approval.preparing`, interrupt before directory rename, and verify neither `approved/` nor `approved_for_training` appears.
- [ ] Add a failing recovery test: interrupt after the complete `approved/` directory rename but before `run.json` update, then rerun with identical reviewed inputs and finalize only the missing status transition.
- [ ] Add failing idempotency tests: identical reviewed inputs return the existing seal; different inputs, edited bundle files, or stale source documents reject without overwriting anything.
- [ ] Implement parser registration and dispatch. Validate before creating `.approval.preparing`; publish that directory with one atomic sibling rename; update `run.json` last through the existing atomic JSON helper.
- [ ] On handled failure, remove only the reserved staging directory after confirming it contains no unexpected names. Preserve Stage 1 files and leave `run.json` at `pending_preparation_review`.
- [ ] Update `QUALITY_TRAINING.md` with reviewed-file schemas, the command example, three approved artifacts, privacy warning, idempotency behavior, and the explicit stop before training. Do not document `train-prepared` as available.
- [ ] Run `cd model && .venv/bin/python -m unittest tests.test_folder_workflow tests.test_preparation_review -v`; require all tests to pass.
- [ ] Run full model verification: `cd model && .venv/bin/python -m unittest discover -s tests -v && .venv/bin/ruff check . && .venv/bin/ruff format --check .`.
- [ ] Run repository verification: `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build`.
- [ ] Commit tests, implementation, documentation, and this plan in repository-approved commit units.

## Acceptance Criteria

- [ ] `approve-preparation` loads no model and invokes no training or evaluation code.
- [ ] Approval is accepted only from a complete Stage 1 run in `pending_preparation_review`.
- [ ] The current source corpus reproduces the exact Stage 1 train/validation/evaluation manifest.
- [ ] Reviewed profile provenance equals the draft, and every profile item passes the Stage 1 fact-free rules against all training passages.
- [ ] Reviewed facts cover every Stage 1 fact ID exactly once; only statements and evidence may change.
- [ ] All reviewed fact statements remain complete, literally supported, numeric-context preserving, nonduplicated, and split-isolated.
- [ ] Every row and the profile carry an explicit user approval marker.
- [ ] Approved outputs are normalized, private, newline-terminated, and sealed with reproducible SHA-256 hashes.
- [ ] The approved bundle is published atomically before `run.json` changes to `approved_for_training`.
- [ ] Interrupted approval is recoverable without partial trusted output or loss of Stage 1 drafts.
- [ ] Identical approval reruns are idempotent; different content cannot overwrite a seal.
- [ ] No candidate, adapter, model output, or activation state is created.
- [ ] Full Python, Ruff, TypeScript, plugin-test, boundary, and build verification passes.

## Risks and Mitigations

- **User approval is mistaken for automatic semantic proof:** require explicit markers but retain provenance and describe approval as a human decision, not a model-derived score.
- **Reviewed JSON edits hidden provenance fields:** compare every immutable field with the Stage 1 draft and reconstruct approved rows from trusted draft provenance.
- **Sources change after preparation:** reload and hash the complete corpus before approval; any manifest drift requires a new Stage 1 run.
- **Stage 1 validators and Stage 2 validators diverge:** extract one set of pure validators and make both workflows call them.
- **Multiple files are partially published:** assemble a private sibling directory and rename the complete bundle once; update run status last.
- **A stale or edited seal is reused:** verify all hashes on every idempotent call and later require Stage 3 to repeat the same verification.
- **User data leaks through logs:** stdout contains only run path, status, counts, and hashes; never source passages, facts, or profile values.

## Verification Summary

Stage 2 is complete only when reusable validators are shared with Stage 1, exact review coverage and source immutability are proven, the approved bundle survives interruption tests, all repository verification commands pass, and tests prove that model/training entry points were never called.

## Deferred Follow-ups

- Stage 3: `train-prepared`, approved-seal verification, supervised sample construction, LoRA training, automatic answer-leakage diagnostics, reviewer-neutral quality review, blind preference collection, and candidate promotion.
- Plugin onboarding and approval UI.
- Actual personal-document review and `my-style-v3` training.
