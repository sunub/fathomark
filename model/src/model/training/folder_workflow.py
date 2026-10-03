"""One folder in, automatically derived local data and an evaluated candidate out."""

import json
import math
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

import torch

from model.evaluation.runner import build_prompt, validate_cases
from model.training.base_model import DEFAULT_MODEL_NAME, load_base_model
from model.training.corpus import Document, load_documents
from model.training.folder_data import (
    prepare_folder_data,
    prepare_folder_draft,
    split_folder_documents,
    split_preparation_documents,
)
from model.training.inference import generate_text
from model.training.supervised import build_supervised_samples, ensure_disjoint
from model.training.trainer import TrainConfig
from model.training.workflow import fit_candidate


def add_folder_command(commands):
    parser = commands.add_parser(
        "train-folder",
        help="Prepare, train and evaluate directly from selected writing",
    )
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--model", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--device", choices=["cpu", "cuda", "mps"])
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--accumulation-steps", type=int, default=4)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--max-chars", type=int, default=1200)
    parser.add_argument("--max-new-tokens", type=int, default=256)
    parser.add_argument("--extraction-tokens", type=int, default=512)
    parser.add_argument("--rank", type=int, default=8)
    parser.add_argument("--alpha", type=float, default=16.0)
    parser.add_argument("--seed", type=int, default=42)

    prepare = commands.add_parser(
        "prepare-folder",
        help="Create reviewable style and fact drafts without training",
    )
    prepare.add_argument("--input-dir", required=True, type=Path)
    prepare.add_argument("--output-dir", type=Path)
    prepare.add_argument("--dry-run", action="store_true")
    prepare.add_argument("--model", default=DEFAULT_MODEL_NAME)
    prepare.add_argument("--device", choices=["cpu", "cuda", "mps"])
    prepare.add_argument("--max-chars", type=int, default=1200)
    prepare.add_argument("--extraction-tokens", type=int, default=512)
    prepare.add_argument("--seed", type=int, default=42)


def _json(path, value):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def _json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def _write_temporary(path, text):
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text, encoding="utf-8")
    return temporary


def _atomic_json(path, value):
    _write_temporary(path, _json_text(value)).replace(path)


def _filter_lengths(prepared, tokenizer, max_length):
    for split, attribute in [("train", "training"), ("validation", "validation")]:
        accepted = []
        for example in getattr(prepared, attribute):
            try:
                build_supervised_samples([example], tokenizer, max_length)
            except ValueError as error:
                prepared.skipped.append(
                    {"split": split, "id": example.case.id, "reason": str(error)}
                )
            else:
                accepted.append(example)
        setattr(prepared, attribute, accepted)
    accepted_cases = []
    for case in prepared.evaluation:
        prompt = tokenizer.apply_chat_template(
            [{"role": "user", "content": build_prompt(case)}],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        if len(tokenizer.encode(prompt, add_special_tokens=False)) > max_length:
            prepared.skipped.append(
                {
                    "split": "evaluation",
                    "id": case.id,
                    "reason": "Evaluation prompt exceeds max-length",
                }
            )
        else:
            accepted_cases.append(case)
    prepared.evaluation = accepted_cases
    ids = {
        "train": {item.case.id for item in prepared.training},
        "validation": {item.case.id for item in prepared.validation},
        "evaluation": {case.id for case in prepared.evaluation},
    }
    for split, accepted_ids in ids.items():
        prepared.records[split] = [
            row for row in prepared.records[split] if row["id"] in accepted_ids
        ]


def prepare_folder(args):
    if min(args.max_chars, args.extraction_tokens) < 1:
        raise ValueError("max-chars and extraction-tokens must be positive")

    selected = args.input_dir.expanduser()
    evaluation_dir = selected / "evaluation"
    if evaluation_dir.is_symlink() or not evaluation_dir.is_dir():
        raise ValueError("Folder preparation requires a real evaluation/ directory")

    training_documents = load_documents(
        selected, excluded_relative_dirs=frozenset({"evaluation"})
    )
    evaluation_documents = [
        Document(
            path=f"evaluation/{document.path}",
            text=document.text,
            sha256=document.sha256,
        )
        for document in load_documents(evaluation_dir)
    ]
    splits = split_preparation_documents(
        training_documents, evaluation_documents, args.seed
    )
    summary = {
        "documents": {name: len(documents) for name, documents in splits.items()},
        "status": "dry_run" if args.dry_run else "preparing",
    }
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    if args.output_dir is None:
        raise ValueError("--output-dir is required for preparation")
    root = selected.resolve()
    output = args.output_dir.expanduser().resolve()
    if output == root or root in output.parents:
        raise ValueError("Output directory must be outside the input folder")
    if output.exists():
        raise ValueError("Output directory already exists; choose a new directory")
    output.mkdir(parents=True)
    run = {
        "schema_version": 1,
        "command": "prepare-folder",
        "input_dir": str(root),
        "output_dir": str(output),
        "model": args.model,
        "device": args.device,
        "max_chars": args.max_chars,
        "extraction_tokens": args.extraction_tokens,
        "seed": args.seed,
        **summary,
    }
    _atomic_json(output / "run.json", run)
    artifact_names = (
        "preparation.json",
        "style-profile.draft.json",
        "facts.draft.jsonl",
        "automatic-checks.json",
    )
    try:
        torch.manual_seed(args.seed)
        tokenizer, model = load_base_model(
            args.model, torch.device(args.device) if args.device else None
        )

        def extract(prompt):
            return generate_text(
                model, tokenizer, prompt, max_new_tokens=args.extraction_tokens
            )

        prepared = prepare_folder_draft(splits, extract, args.max_chars)
        manifest = {
            split: [
                {"path": document.path, "sha256": document.sha256}
                for document in documents
            ]
            for split, documents in splits.items()
        }
        sample_counts = {
            split: sum(item.split == split for item in prepared.facts)
            for split in ("train", "validation", "evaluation")
        }
        artifacts = {
            "preparation.json": _json_text(
                {
                    "schema_version": 1,
                    "documents": manifest,
                    "samples": sample_counts,
                    "skipped": list(prepared.skipped),
                    "automatic_checks_only": True,
                    "semantic_review": "pending",
                    "extraction_model": args.model,
                    "extraction_revision": getattr(model.config, "_commit_hash", None),
                }
            ),
            "style-profile.draft.json": _json_text(
                {
                    "schema_version": 1,
                    "status": "pending_review",
                    "source_documents": list(prepared.style_sources),
                    "profile": asdict(prepared.style_profile),
                }
            ),
            "facts.draft.jsonl": "".join(
                json.dumps(asdict(item), ensure_ascii=False, allow_nan=False) + "\n"
                for item in prepared.facts
            ),
            "automatic-checks.json": _json_text(
                {
                    "schema_version": 1,
                    "automatic_checks_establish_semantic_approval": False,
                    "checks": list(prepared.automatic_checks),
                }
            ),
        }
        temporary_paths = {
            name: _write_temporary(output / name, text)
            for name, text in artifacts.items()
        }
        for name, temporary in temporary_paths.items():
            if name.endswith(".jsonl"):
                for line in temporary.read_text(encoding="utf-8").splitlines():
                    json.loads(line)
            else:
                json.loads(temporary.read_text(encoding="utf-8"))
        for name in artifact_names:
            temporary_paths[name].replace(output / name)
        final_run = {**run, "status": "pending_preparation_review"}
        _atomic_json(output / "run.json", final_run)
        print(
            json.dumps(
                {
                    "output": str(output),
                    "status": "pending_preparation_review",
                    "samples": sample_counts,
                },
                ensure_ascii=False,
            )
        )
    except BaseException as error:
        for name in artifact_names:
            (output / name).unlink(missing_ok=True)
            (output / f".{name}.tmp").unlink(missing_ok=True)
        _atomic_json(
            output / "run.json",
            {**run, "status": "preparation_failed", "error": str(error)},
        )
        raise


def train_folder(args):
    TrainConfig(
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        accumulation_steps=args.accumulation_steps,
        seed=args.seed,
    )
    if (
        min(
            args.max_length,
            args.max_chars,
            args.max_new_tokens,
            args.extraction_tokens,
            args.rank,
        )
        < 1
        or args.max_length < 2
        or not math.isfinite(args.alpha)
        or args.alpha <= 0
    ):
        raise ValueError("Lengths, token limits, rank and alpha must be positive")
    selected = args.input_dir.expanduser()
    splits = split_folder_documents(load_documents(selected), args.seed)
    root = selected.resolve()
    summary = {
        "documents": {name: len(docs) for name, docs in splits.items()},
        "training_data_status": "auto_derived_unreviewed",
    }
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    output = (
        args.output_dir.expanduser().resolve()
        if args.output_dir
        else root.parent
        / f"{root.name}-style-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S-%f')}"
    )
    if output == root or root in output.parents:
        raise ValueError("Output directory must be outside the input folder")
    if output.exists():
        raise ValueError("Output directory already exists; choose a new directory")
    output.mkdir(parents=True)
    _json(output / "run.json", {**summary, "status": "preparing"})
    try:
        torch.manual_seed(args.seed)
        tokenizer, model = load_base_model(
            args.model, torch.device(args.device) if args.device else None
        )

        def extract(prompt):
            return generate_text(
                model, tokenizer, prompt, max_new_tokens=args.extraction_tokens
            )

        prepared = prepare_folder_data(splits, extract, args.max_chars)
        _filter_lengths(prepared, tokenizer, args.max_length)
        data = output / "data"
        data.mkdir()
        for split, records in prepared.records.items():
            (data / f"{split}.jsonl").write_text(
                "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in records),
                encoding="utf-8",
            )
        manifest = {
            split: [{"path": doc.path, "sha256": doc.sha256} for doc in docs]
            for split, docs in splits.items()
        }
        _json(
            output / "preparation.json",
            {
                "documents": manifest,
                "samples": {
                    split: len(rows) for split, rows in prepared.records.items()
                },
                "skipped": prepared.skipped,
                "automatic_checks_only": True,
                "semantic_review": "pending",
                "extraction_model": args.model,
                "extraction_revision": getattr(model.config, "_commit_hash", None),
            },
        )
        ensure_disjoint(prepared.training, prepared.validation, prepared.evaluation)
        validate_cases(prepared.evaluation)
        fit_candidate(
            args,
            prepared.training,
            prepared.validation,
            prepared.evaluation,
            output / "candidate",
            model_context=(tokenizer, model),
            metadata_extra={
                "training_data_status": "auto_derived_unreviewed",
                "documents": {
                    split: manifest[split] for split in ("train", "validation")
                },
                "preparation_version": 1,
            },
        )
        _json(
            output / "run.json",
            {
                **summary,
                "status": "pending_review",
                "candidate": str(output / "candidate"),
            },
        )
        print(
            json.dumps(
                {"output": str(output), "status": "pending_review"}, ensure_ascii=False
            )
        )
    except Exception as error:
        _json(output / "run.json", {**summary, "status": "failed", "error": str(error)})
        raise
