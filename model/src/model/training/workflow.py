"""Supervised quality training and explicit, review-gated evaluation commands."""

import hashlib
import json
import math
from pathlib import Path

import torch
from transformers import AutoTokenizer

from model.evaluation.case import load_cases
from model.evaluation.runner import (
    finalize_review,
    generate_results,
    validate_cases,
    write_evaluation,
)
from model.training.base_model import DEFAULT_MODEL_NAME, load_base_model
from model.training.inference import generate_text
from model.training.lora import inject_lora, load_adapter_state_dict
from model.training.supervised import (
    build_supervised_samples,
    ensure_disjoint,
    ensure_unseen,
    load_supervised,
    source_fingerprint,
)
from model.training.trainer import TrainConfig, fit, read_candidate, save_candidate


def add_commands(commands):
    from model.training.folder_workflow import add_folder_command

    add_folder_command(commands)
    prepare = commands.add_parser(
        "prepare-targets", help="Create unapproved review forms for reference answers"
    )
    prepare.add_argument("--input-file", required=True, type=Path)
    prepare.add_argument("--output-file", required=True, type=Path)
    train = commands.add_parser(
        "train-supervised", help="Learn reviewed answers, then evaluate unseen cases"
    )
    train.add_argument("--train-file", required=True, type=Path)
    train.add_argument("--validation-file", required=True, type=Path)
    train.add_argument("--eval-file", required=True, type=Path)
    train.add_argument("--output-dir", type=Path)
    train.add_argument("--dry-run", action="store_true")
    train.add_argument("--model", default=DEFAULT_MODEL_NAME)
    train.add_argument("--device", choices=["cpu", "cuda", "mps"])
    train.add_argument("--epochs", type=int, default=3)
    train.add_argument("--learning-rate", type=float, default=1e-4)
    train.add_argument("--accumulation-steps", type=int, default=4)
    train.add_argument("--max-length", type=int, default=1024)
    train.add_argument("--max-new-tokens", type=int, default=256)
    train.add_argument("--rank", type=int, default=8)
    train.add_argument("--alpha", type=float, default=16.0)
    train.add_argument("--seed", type=int, default=42)
    evaluate = commands.add_parser(
        "evaluate", help="Compare the original base and candidate on held-out cases"
    )
    evaluate.add_argument("--adapter-dir", required=True, type=Path)
    evaluate.add_argument("--cases-file", required=True, type=Path)
    evaluate.add_argument("--output-dir", required=True, type=Path)
    evaluate.add_argument("--device", choices=["cpu", "cuda", "mps"])
    evaluate.add_argument("--max-new-tokens", type=int, default=256)
    review = commands.add_parser(
        "review",
        help="Validate completed review forms and prepare eligible blind comparisons",
    )
    review.add_argument("--run-dir", required=True, type=Path)
    review.add_argument("--reviews-file", required=True, type=Path)


def _fingerprint(text):
    return source_fingerprint(text)


def _case_manifest(examples):
    return [
        {
            "id": item.case.id,
            "source_sha256": source_fingerprint(item.case.source_text),
            "target_sha256": source_fingerprint(item.target_text),
        }
        for item in examples
    ]


def _new_output(path):
    if path is None:
        raise ValueError("--output-dir is required")
    output = path.expanduser().resolve()
    if output.exists():
        raise ValueError("Output directory already exists; choose a new directory")
    return output


def _settings(model, max_new_tokens):
    if max_new_tokens < 1:
        raise ValueError("max-new-tokens must be positive")
    return {
        "max_new_tokens": max_new_tokens,
        "do_sample": False,
        "enable_thinking": False,
        "prompt_version": "grounded-style-v1",
        "base_revision": getattr(model.config, "_commit_hash", None),
        "dtype": str(next(model.parameters()).dtype),
    }


def _results(model, tokenizer, cases, approach, model_name, settings):
    return generate_results(
        cases,
        lambda prompt: generate_text(
            model, tokenizer, prompt, max_new_tokens=settings["max_new_tokens"]
        ),
        approach,
        model_name,
        settings,
    )


def train_supervised(args):
    TrainConfig(
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        accumulation_steps=args.accumulation_steps,
        seed=args.seed,
    )
    if (
        args.max_length < 2
        or args.max_new_tokens < 1
        or args.rank < 1
        or not math.isfinite(args.alpha)
        or args.alpha <= 0
    ):
        raise ValueError(
            "Invalid sequence length, generation limit or LoRA configuration"
        )
    training = load_supervised(args.train_file)
    validation = load_supervised(args.validation_file)
    cases = list(load_cases(args.eval_file))
    validate_cases(cases)
    ensure_disjoint(training, validation, cases)
    counts = {
        "training_examples": len(training),
        "validation_examples": len(validation),
        "evaluation_cases": len(cases),
    }
    if args.dry_run:
        print(json.dumps(counts, indent=2))
        return
    output = _new_output(args.output_dir)
    fit_candidate(args, training, validation, cases, output)


def fit_candidate(
    args,
    training,
    validation,
    cases,
    output,
    *,
    model_context=None,
    metadata_extra=None,
):
    """Shared optimizer/evaluation path for reviewed or provenance-labeled data."""
    config = TrainConfig(
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        accumulation_steps=args.accumulation_steps,
        seed=args.seed,
    )
    torch.manual_seed(args.seed)
    model_name = (
        str(Path(args.model).resolve()) if Path(args.model).is_dir() else args.model
    )
    tokenizer, model = model_context or load_base_model(
        model_name, torch.device(args.device) if args.device else None
    )
    samples = build_supervised_samples(training, tokenizer, args.max_length)
    validation_samples = build_supervised_samples(
        validation, tokenizer, args.max_length
    )
    settings = _settings(model, args.max_new_tokens)
    baseline = _results(
        model, tokenizer, cases, "prompt_baseline", model_name, settings
    )
    modules = inject_lora(model, rank=args.rank, alpha=args.alpha)
    metrics = fit(model, samples, validation_samples, config, select_best=True)
    adapted = _results(model, tokenizer, cases, "lora", model_name, settings)
    save_candidate(
        output,
        model,
        {
            "objective": "supervised_response",
            "base_model": model_name,
            "base_revision": settings["base_revision"],
            "rank": args.rank,
            "alpha": args.alpha,
            "target_modules": ["q_proj", "v_proj"],
            "module_names": modules,
            "max_length": args.max_length,
            "seed": args.seed,
            "training_cases": _case_manifest(training),
            "validation_cases": _case_manifest(validation),
            "quality_status": "pending_review",
            "active": False,
            **(metadata_extra or {}),
        },
        metrics,
        tokenizer=tokenizer,
    )
    report = write_evaluation(output / "evaluation", cases, baseline + adapted)
    print(
        json.dumps(
            {
                "candidate": str(output),
                "evaluation": str(output / "evaluation"),
                "status": report["status"],
                "selected_epoch": metrics["selected_epoch"],
            },
            ensure_ascii=False,
        )
    )


def _check_seen_cases(metadata, cases):
    used = metadata.get("training_cases", []) + metadata.get("validation_cases", [])
    ensure_unseen(cases, used)
    document_hashes = {
        item["sha256"]
        for split in metadata.get("documents", {}).values()
        for item in split
    }
    for case in cases:
        digest = hashlib.sha256(
            case.source_text.replace("\r\n", "\n").strip().encode("utf-8")
        ).hexdigest()
        if digest in document_hashes:
            raise ValueError(
                f"Evaluation source matches the training corpus: {case.id}"
            )


def evaluate_candidate(args):
    output = _new_output(args.output_dir)
    if args.max_new_tokens < 1:
        raise ValueError("max-new-tokens must be positive")
    cases = list(load_cases(args.cases_file))
    validate_cases(cases)
    metadata, state = read_candidate(args.adapter_dir)
    _check_seen_cases(metadata, cases)
    tokenizer, model = load_base_model(
        metadata["base_model"],
        torch.device(args.device) if args.device else None,
        revision=metadata.get("base_revision"),
    )
    tokenizer = AutoTokenizer.from_pretrained(
        args.adapter_dir / "tokenizer", local_files_only=True
    )
    settings = _settings(model, args.max_new_tokens)
    baseline = _results(
        model, tokenizer, cases, "prompt_baseline", metadata["base_model"], settings
    )
    modules = inject_lora(
        model,
        rank=metadata["rank"],
        alpha=metadata["alpha"],
        target_modules=tuple(metadata["target_modules"]),
    )
    if modules != metadata["module_names"]:
        raise ValueError("Adapter architecture does not match base model")
    load_adapter_state_dict(model, state)
    adapted = _results(
        model, tokenizer, cases, "lora", metadata["base_model"], settings
    )
    report = write_evaluation(output, cases, baseline + adapted)
    print(json.dumps({"evaluation": str(output), "status": report["status"]}))


def run_command(args):
    if args.command in ("prepare-folder", "train-folder"):
        from model.training.folder_workflow import prepare_folder, train_folder

        (prepare_folder if args.command == "prepare-folder" else train_folder)(args)
    elif args.command == "prepare-targets":
        from model.training.supervised import prepare_target_reviews

        count = prepare_target_reviews(args.input_file, args.output_file)
        print(json.dumps({"targets": count, "status": "pending_target_review"}))
    elif args.command == "train-supervised":
        train_supervised(args)
    elif args.command == "evaluate":
        evaluate_candidate(args)
    elif args.command == "review":
        print(
            json.dumps(
                finalize_review(args.run_dir, args.reviews_file),
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        raise ValueError(f"Unknown workflow command: {args.command}")
