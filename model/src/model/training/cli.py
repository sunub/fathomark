"""python -m model.training {train,generate}: explicit local folder training."""

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoTokenizer

from model.training.base_model import DEFAULT_MODEL_NAME, load_base_model
from model.training.corpus import load_documents, split_documents, token_chunks
from model.training.inference import generate_text
from model.training.lora import inject_lora, load_adapter_state_dict
from model.training.trainer import TrainConfig, fit, read_candidate, save_candidate


def _parser():
    from model.training.workflow import add_commands

    parser = argparse.ArgumentParser(
        description="Train a local writing-style LoRA candidate"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    train = commands.add_parser("train")
    train.add_argument("--input-dir", required=True, type=Path)
    train.add_argument("--output-dir", type=Path)
    train.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect documents without loading a model",
    )
    train.add_argument("--model", default=DEFAULT_MODEL_NAME)
    train.add_argument("--device", choices=["cpu", "cuda", "mps"])
    train.add_argument("--epochs", type=int, default=1)
    train.add_argument("--learning-rate", type=float, default=1e-4)
    train.add_argument("--accumulation-steps", type=int, default=4)
    train.add_argument("--max-length", type=int, default=512)
    train.add_argument("--rank", type=int, default=8)
    train.add_argument("--alpha", type=float, default=16.0)
    train.add_argument("--validation-fraction", type=float, default=0.2)
    train.add_argument("--seed", type=int, default=42)
    generate = commands.add_parser("generate")
    generate.add_argument("--adapter-dir", type=Path, required=True)
    generate.add_argument("--request", required=True)
    generate.add_argument("--device", choices=["cpu", "cuda", "mps"])
    generate.add_argument("--max-new-tokens", type=int, default=256)
    generate.add_argument(
        "--baseline", action="store_true", help="Same base and settings without adapter"
    )
    add_commands(commands)
    return parser


def _train(args):
    import math

    config = TrainConfig(
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        accumulation_steps=args.accumulation_steps,
        seed=args.seed,
    )
    if (
        args.max_length < 2
        or args.rank < 1
        or not math.isfinite(args.alpha)
        or args.alpha <= 0
    ):
        raise ValueError("max-length >= 2, rank >= 1 and finite alpha > 0 are required")
    selected = args.input_dir.expanduser()
    documents = load_documents(selected)
    root = selected.resolve()
    train, validation = split_documents(documents, args.validation_fraction, args.seed)
    summary = {
        "train_documents": len(train),
        "validation_documents": len(validation),
        "train_characters": sum(len(d.text) for d in train),
        "validation_characters": sum(len(d.text) for d in validation),
    }
    if args.dry_run:
        print(json.dumps(summary, indent=2))
        return
    if args.output_dir is None:
        raise ValueError("--output-dir is required for training")
    output = args.output_dir.expanduser().resolve()
    if output == root or root in output.parents:
        raise ValueError("Output directory must be outside the input folder")
    if output.exists():
        raise ValueError(
            "Output directory already exists; choose a new candidate directory"
        )
    torch.manual_seed(args.seed)
    tokenizer, model = load_base_model(
        args.model, torch.device(args.device) if args.device else None
    )
    train_chunks = token_chunks(train, tokenizer, args.max_length)
    validation_chunks = token_chunks(validation, tokenizer, args.max_length)
    modules = inject_lora(model, rank=args.rank, alpha=args.alpha)
    print(
        json.dumps(
            {
                **summary,
                "train_chunks": len(train_chunks),
                "validation_chunks": len(validation_chunks),
            }
        ),
        flush=True,
    )
    metrics = fit(model, train_chunks, validation_chunks, config)
    manifest = {
        split: [{"path": d.path, "sha256": d.sha256} for d in documents]
        for split, documents in [("train", train), ("validation", validation)]
    }
    save_candidate(
        output,
        model,
        {
            "base_model": args.model,
            "base_revision": getattr(model.config, "_commit_hash", None),
            "rank": args.rank,
            "alpha": args.alpha,
            "target_modules": ["q_proj", "v_proj"],
            "module_names": modules,
            "max_length": args.max_length,
            "seed": args.seed,
            "validation_fraction": args.validation_fraction,
            "documents": manifest,
            "torch_version": torch.__version__,
        },
        metrics,
        tokenizer=tokenizer,
    )
    print(f"Candidate saved: {output}")


def _generate(args):
    if args.max_new_tokens < 1:
        raise ValueError("max-new-tokens must be positive")
    metadata, state = read_candidate(args.adapter_dir)
    _, model = load_base_model(
        metadata["base_model"],
        torch.device(args.device) if args.device else None,
        revision=metadata.get("base_revision"),
    )
    tokenizer = AutoTokenizer.from_pretrained(
        args.adapter_dir / "tokenizer", local_files_only=True
    )
    if not args.baseline:
        modules = inject_lora(
            model,
            rank=metadata["rank"],
            alpha=metadata["alpha"],
            target_modules=tuple(metadata["target_modules"]),
        )
        if modules != metadata["module_names"]:
            raise ValueError("Adapter architecture does not match the base model")
        load_adapter_state_dict(model, state)
    print(
        generate_text(
            model, tokenizer, args.request, max_new_tokens=args.max_new_tokens
        )
    )


def main(argv=None):
    args = _parser().parse_args(argv)
    if args.command == "train":
        _train(args)
    elif args.command == "generate":
        _generate(args)
    else:
        from model.training.workflow import run_command

        run_command(args)
