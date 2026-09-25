# Fathomark model workspace

This Python package is the local workspace for model experiments. The current
code prepares and reviews evaluation data; it does not load a language model,
train a model, or apply a LoRA adapter. Those are separate implementation
steps.

## Evaluation flow

1. Add one JSON object per line to an evaluation-case JSONL file. Cases contain
   the request, source evidence, selected style reference, and facts to preserve.
2. A model runner writes one `EvaluationResult` per approach to a results JSONL
   file. Each result records its case, generated text, base model, and scalar
   generation settings.
3. `group_results` and `make_result_pairs` pair the baseline and LoRA results.
   A pair is rejected if its base model or generation settings differ.
4. Record a `ResponseAssessment` for each answer. Grounding, fact preservation,
   conflict handling, and safety remain separate checks from style preference.
5. Only a pair whose two assessments pass every quality gate can become a
   `PairPreference`. `randomize_pair` assigns left and right sides; pass only
   `BlindPair.for_user()` to a reviewer so method names stay out of the display.

The preference record retains the left/right-to-method mapping for analysis.
Store evaluation files locally and do not use preference records alone to
activate or update an adapter.

## Package map

- `model.evaluation.case`: evaluation case schema and JSONL loading.
- `model.evaluation.result`: generated result schema, persistence, and grouping.
- `model.evaluation.assessment`: per-response quality checks and persistence.
- `model.evaluation.pair`: comparable result pairs and randomized blind views.
- `model.evaluation.pair_review`: quality-gate enforcement and preference records.

Use a separate cases file for held-out evaluation examples. The split policy,
scoring thresholds, and training workflow remain open design decisions.

## Checks

From this directory, run:

```bash
uv run python -m unittest discover -s tests
uv run ruff check .
uv run ruff format --check .
```
