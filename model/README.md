# Fathomark model workspace

This Python package prepares evaluation data and trains a local writing-style
LoRA candidate from an explicitly selected folder. The default base is
Qwen/Qwen3-1.7B. The Obsidian plugin does not run or automatically activate it.

For the default folder-only training and connected evaluation, see
[평가 기준과 연결한 문체 학습](QUALITY_TRAINING.md). The `train-supervised`
command learns only reviewed answer tokens, selects weights using separate
validation examples, and generates paired held-out results with pending review
forms. `evaluate` also connects existing folder-trained candidates to this flow.

## Recommended: folder to training and evaluation

From `model/`, point to your selected writing. No manually authored JSONL files
are needed:

```bash
uv run python -m model.training train-folder --input-dir "/absolute/path/to/my-writing"
```

The command splits original documents before extracting evidence, preserves
original passages as targets, and creates internal train/validation/evaluation
files. It trains the candidate and generates paired evaluation answers. Output
defaults to a new timestamped sibling directory. Add `--dry-run` to inspect the
document split without loading models or writing files. At least three distinct
documents are needed. Automatically derived samples are labeled unreviewed;
final semantic quality and style preference remain pending review.

## Advanced: raw document continuation

From `model/`, use the existing environment (`uv sync --locked` if needed).
Put only your selected writing samples in a dedicated folder. UTF-8 `.md` and
`.txt` files are read recursively, including Markdown markup, frontmatter and
quotations as written. Hidden paths and symbolic links are skipped. No external
service receives the corpus. Loading the base model may download model files.

First inspect the document counts without downloading/loading a model:

```bash
uv run python -m model.training train \
  --input-dir "/absolute/path/to/my-writing" --dry-run
```

Train and save a new candidate outside the input folder:

```bash
uv run python -m model.training train \
  --input-dir "/absolute/path/to/my-writing" \
  --output-dir "/absolute/path/to/style-candidate-001" \
  --device cuda --epochs 1 --max-length 512 \
  --rank 8 --alpha 16 --learning-rate 0.0001 --accumulation-steps 4
```

Omit `--device` to select CUDA, then Apple MPS, then CPU automatically. CPU is
useful for tests but full-model training can be very slow. CUDA/MPS execution
and full Qwen3-1.7B memory requirements have not been validated here. This is
ordinary LoRA, not quantized training. Lower `--max-length` if memory is tight.
All documents and token chunks are currently held in memory.

The trainer freezes the base weights and trains float32 LoRA matrices on the
query/value projections. Existing output directories are rejected. It stores:

- `adapter.pt`: only the custom LoRA weights (not a PEFT/GGUF export).
- `adapter.json`: model/revision, settings, document paths/hashes, and candidate status.
- `metrics.json`: training and held-out next-token losses before/after training.
- `tokenizer/`: the tokenizer needed to reproduce input processing.

These local files may contain sensitive paths and learned information; keep
them alongside your private data rather than committing them to source control.
A failed save can leave a partial output directory; use a new output location
when retrying. There is no resume-from-checkpoint support.

Compare outputs using the same request and deterministic generation settings:

```bash
uv run python -m model.training generate \
  --adapter-dir "/absolute/path/to/style-candidate-001" \
  --request "다음 내용을 차분하게 설명해 줘: 오늘 회의는 오후 세 시에 열린다." \
  --max-new-tokens 128

uv run python -m model.training generate \
  --adapter-dir "/absolute/path/to/style-candidate-001" \
  --request "다음 내용을 차분하게 설명해 줘: 오늘 회의는 오후 세 시에 열린다." \
  --max-new-tokens 128 --baseline
```

## What the training does and does not prove

The objective is document continuation: predict the next token in selected
writing. It does not invent request/rewrite pairs, learn a factual knowledge
database, or prove that chat replies match your style. Content can also be
memorized. Start with a small number of epochs and evaluate actual answers.

Exact duplicates after newline/outer-whitespace normalization are removed
before a seeded document-level split (default 20% validation, seed 42). At
least two distinct nonempty documents are required; this is a technical minimum,
not a guarantee of useful training. Near-duplicates are not detected. Token
chunks overlap by one token to preserve transitions and never cross document
boundaries. Validation loss is weighted by predicted tokens and is not a style,
fact-preservation or safety score. Keep a third, unused evaluation set outside
the selected folder for the quality/preference flow below.

The baseline command omits the adapter; for the planned prompt/example baseline,
include the same selected examples and evidence in the request for both runs.
The standalone `generate` command prints text; it does not automatically create `EvaluationResult`
records, collect preference feedback, or activate a candidate.

References: [Qwen3 model/input format](https://huggingface.co/Qwen/Qwen3-1.7B)
and [causal language modeling](https://huggingface.co/docs/transformers/v4.40.0/tasks/language_modeling).

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
- `model.training.corpus`: selected files, deduplication, splitting and token chunks.
- `model.training.lora`: custom adapter layers and strict weight restoration.
- `model.training.trainer`: optimization, held-out loss and candidate storage.
- `model.training.cli`: training and baseline/candidate generation commands.
- `model.training.supervised`: reviewed targets, prompt masking and split isolation.
- `model.training.workflow`: supervised training, held-out evaluation and review commands.
- `model.training.folder_data` / `folder_workflow`: automatic preparation and the folder-only pipeline.
- `model.evaluation.runner`: common grounded prompts, result-bound quality reviews and blinded comparisons.
- `model.training.base_model` / `inference`: model loading and chat generation.

Use a separate cases file for held-out evaluation examples. Scoring thresholds
and production activation remain separate decisions.

## Checks

From this directory, run:

```bash
uv run python -m unittest discover -s tests
uv run ruff check .
uv run ruff format --check .
```

Tests include a randomly initialized tiny Qwen3 model: real optimization with a
frozen backbone, adapter roundtrip, and local train/save/load/generate commands.
They do not download Qwen3-1.7B or demonstrate user-style improvement.
