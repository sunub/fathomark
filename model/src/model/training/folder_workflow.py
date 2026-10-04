"""One folder in, automatically derived local data and an evaluated candidate out."""

import hashlib
import json
import math
import shutil
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

    approve = commands.add_parser(
        "approve-preparation",
        help="Validate reviewed preparation files and seal them for later training",
    )
    approve.add_argument("--run-dir", required=True, type=Path)
    approve.add_argument("--style-profile", required=True, type=Path)
    approve.add_argument("--facts-file", required=True, type=Path)

    train_prepared = commands.add_parser(
        "train-prepared",
        help="Train and evaluate one candidate from a sealed preparation",
    )
    train_prepared.add_argument("--run-dir", required=True, type=Path)
    train_prepared.add_argument("--dry-run", action="store_true")
    train_prepared.add_argument("--device", choices=["cpu", "cuda", "mps"])
    train_prepared.add_argument("--epochs", type=int, default=3)
    train_prepared.add_argument("--learning-rate", type=float, default=1e-4)
    train_prepared.add_argument("--accumulation-steps", type=int, default=4)
    train_prepared.add_argument("--max-length", type=int, default=2048)
    train_prepared.add_argument("--max-new-tokens", type=int, default=256)
    train_prepared.add_argument("--rank", type=int, default=8)
    train_prepared.add_argument("--alpha", type=float, default=16.0)
    train_prepared.add_argument("--seed", type=int, default=42)


def _json(path, value):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def _json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def _write_temporary(path, text):
    temporary = path.with_name(f".{path.name}.tmp")
    if temporary.is_symlink():
        raise ValueError(f"Temporary path must not be a symlink: {temporary}")
    if temporary.exists():
        if not temporary.is_file():
            raise ValueError(f"Temporary path must be a regular file: {temporary}")
        temporary.unlink()
    with temporary.open("x", encoding="utf-8") as file:
        file.write(text)
    return temporary


def _atomic_json(path, value):
    _write_temporary(path, _json_text(value)).replace(path)


def _canonical_model_name(value: str) -> str:
    local = Path(value).expanduser()
    return str(local.resolve()) if local.is_dir() else value


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
    staging = output.with_name(f".{output.name}.preparing")
    if staging.exists():
        raise ValueError("Preparation staging directory already exists")
    staging.mkdir(parents=True)
    model_name = _canonical_model_name(args.model)
    run = {
        "schema_version": 1,
        "command": "prepare-folder",
        "input_dir": str(root),
        "output_dir": str(output),
        "model": model_name,
        "device": args.device,
        "max_chars": args.max_chars,
        "extraction_tokens": args.extraction_tokens,
        "seed": args.seed,
        **summary,
    }
    _atomic_json(staging / "run.json", run)
    artifact_names = (
        "preparation.json",
        "style-profile.draft.json",
        "facts.draft.jsonl",
        "automatic-checks.json",
    )
    try:
        torch.manual_seed(args.seed)
        tokenizer, model = load_base_model(
            model_name, torch.device(args.device) if args.device else None
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
                    "extraction_model": model_name,
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
            name: _write_temporary(staging / name, text)
            for name, text in artifacts.items()
        }
        for name, temporary in temporary_paths.items():
            if name.endswith(".jsonl"):
                for line in temporary.read_text(encoding="utf-8").splitlines():
                    json.loads(line)
            else:
                json.loads(temporary.read_text(encoding="utf-8"))
        for name in artifact_names:
            temporary_paths[name].replace(staging / name)
        final_run = {**run, "status": "pending_preparation_review"}
        _atomic_json(staging / "run.json", final_run)
        staging.replace(output)
    except BaseException as error:
        for name in artifact_names:
            (staging / name).unlink(missing_ok=True)
            (staging / f".{name}.tmp").unlink(missing_ok=True)
        (staging / ".run.json.tmp").unlink(missing_ok=True)
        if staging.exists():
            _atomic_json(
                staging / "run.json",
                {**run, "status": "preparation_failed", "error": str(error)},
            )
            staging.replace(output)
        raise
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


_APPROVAL_NAMES = (
    "style-profile.approved.json",
    "facts.approved.jsonl",
    "approval.json",
)


def _clear_approval_staging(staging: Path) -> None:
    if not staging.exists() and not staging.is_symlink():
        return
    if staging.is_symlink() or not staging.is_dir():
        raise ValueError("Approval staging path is not a private directory")
    entries = list(staging.iterdir())
    if any(
        entry.name not in _APPROVAL_NAMES or not entry.is_file() for entry in entries
    ):
        raise ValueError("Approval staging directory contains unexpected entries")
    for entry in entries:
        entry.unlink()
    staging.rmdir()


def _approval_run(run_dir: Path) -> dict[str, object]:
    run_path = run_dir / "run.json"
    if run_path.is_symlink() or not run_path.is_file():
        raise ValueError("run.json must be a regular non-symlink file")
    try:
        run = json.loads(run_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read run.json: {error}") from error
    if not isinstance(run, dict):
        raise TypeError("run.json must contain an object")
    return run


def _approval_summary(run_dir: Path, approval_sha256: str, count: int) -> None:
    print(
        json.dumps(
            {
                "run": str(run_dir),
                "status": "approved_for_training",
                "facts": count,
                "approval_sha256": approval_sha256,
            },
            ensure_ascii=False,
        )
    )


def approve_preparation(args):
    """Validate reviewed drafts and atomically publish a private sealed bundle."""
    from model.training.preparation_review import (
        approved_artifacts,
        review_preparation,
        verify_approval_bundle,
    )

    run_dir = args.run_dir.expanduser()
    if run_dir.is_symlink() or not run_dir.is_dir():
        raise ValueError("run-dir must be an existing non-symlink directory")
    approved = review_preparation(run_dir, args.style_profile, args.facts_file)
    artifacts = approved_artifacts(approved)
    approval_sha256 = hashlib.sha256(artifacts["approval.json"]).hexdigest()
    approved_dir = run_dir / "approved"
    staging = run_dir / ".approval.preparing"
    run = _approval_run(run_dir)

    if approved_dir.exists() or approved_dir.is_symlink():
        _clear_approval_staging(staging)
        verify_approval_bundle(approved_dir)
        if any(
            (approved_dir / name).read_bytes() != artifacts[name]
            for name in _APPROVAL_NAMES
        ):
            raise ValueError("A different approval bundle is already sealed")
        if run.get("status") == "approved_for_training":
            if (
                run.get("approval_dir") != "approved"
                or run.get("approval_sha256") != approval_sha256
            ):
                raise ValueError("run.json disagrees with the sealed approval bundle")
            _approval_summary(run_dir, approval_sha256, len(approved.facts))
            return
        if run.get("status") != "pending_preparation_review":
            raise ValueError("run.json is not recoverable for approval")
    else:
        if run.get("status") != "pending_preparation_review":
            raise ValueError("approved_for_training run is missing its sealed bundle")
        _clear_approval_staging(staging)
        try:
            staging.mkdir(mode=0o700)
            staging.chmod(0o700)
            for name in _APPROVAL_NAMES:
                path = staging / name
                with path.open("xb") as file:
                    file.write(artifacts[name])
                path.chmod(0o600)
            verify_approval_bundle(staging)
            staging.replace(approved_dir)
        except BaseException:
            _clear_approval_staging(staging)
            raise

    final_run = {
        **run,
        "status": "approved_for_training",
        "approval_dir": "approved",
        "approval_sha256": approval_sha256,
    }
    _atomic_json(run_dir / "run.json", final_run)
    _approval_summary(run_dir, approval_sha256, len(approved.facts))


def _prepared_hyperparameters(args) -> dict[str, object]:
    integer_values = {
        "epochs": args.epochs,
        "accumulation_steps": args.accumulation_steps,
        "max_length": args.max_length,
        "max_new_tokens": args.max_new_tokens,
        "rank": args.rank,
    }
    if any(
        isinstance(value, bool) or not isinstance(value, int) or value < 1
        for value in integer_values.values()
    ):
        raise ValueError("training counts and lengths must be positive integers")
    if args.max_length < 2:
        raise ValueError("max-length must be at least 2")
    if isinstance(args.seed, bool) or not isinstance(args.seed, int):
        raise TypeError("seed must be an integer")
    if (
        isinstance(args.learning_rate, bool)
        or not isinstance(args.learning_rate, (int, float))
        or not math.isfinite(args.learning_rate)
        or args.learning_rate <= 0
        or isinstance(args.alpha, bool)
        or not isinstance(args.alpha, (int, float))
        or not math.isfinite(args.alpha)
        or args.alpha <= 0
    ):
        raise ValueError("learning-rate and alpha must be finite and positive")
    return {
        "device": args.device,
        "epochs": args.epochs,
        "learning_rate": args.learning_rate,
        "accumulation_steps": args.accumulation_steps,
        "max_length": args.max_length,
        "max_new_tokens": args.max_new_tokens,
        "rank": args.rank,
        "alpha": args.alpha,
        "seed": args.seed,
    }


def _canonical_sha256(value: object) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _clear_candidate_staging(run_dir: Path, staging: Path) -> None:
    if not staging.exists() and not staging.is_symlink():
        return
    if staging.parent != run_dir or staging.name != ".candidate.training":
        raise ValueError("candidate staging path is outside the selected run")
    if staging.is_symlink() or not staging.is_dir():
        raise ValueError("candidate staging path must be a private directory")
    shutil.rmtree(staging)


def _prepared_summary(
    run_dir: Path,
    status: str,
    approval_sha256: str,
    counts: dict[str, int],
) -> None:
    print(
        json.dumps(
            {
                "run": str(run_dir),
                "status": status,
                "approval_sha256": approval_sha256,
                "samples": counts,
            },
            ensure_ascii=False,
        )
    )


def train_prepared(args):
    """Train one sealed candidate and stop before human quality review."""
    from model.evaluation.result import load_results
    from model.training.prepared_training import (
        load_prepared_training,
        seal_candidate,
        training_input_record,
        training_recall_diagnostics,
        verify_candidate_seal,
    )

    run_dir = args.run_dir.expanduser()
    allowed_statuses = frozenset(
        {
            "approved_for_training",
            "training",
            "training_failed",
            "pending_quality_review",
        }
    )
    prepared = load_prepared_training(run_dir, allowed_statuses)
    hyperparameters = _prepared_hyperparameters(args)
    base_model = _canonical_model_name(prepared.base_model)
    record = training_input_record(
        prepared.datasets,
        approval_sha256=prepared.approval_sha256,
        source_manifest_sha256=prepared.source_manifest_sha256,
        base_model=base_model,
        base_revision=prepared.base_revision,
        hyperparameters=hyperparameters,
    )
    counts = dict(record["split_counts"])
    if args.dry_run:
        _prepared_summary(
            run_dir, "verified_for_training", prepared.approval_sha256, counts
        )
        return

    run = _approval_run(run_dir)
    clean_run = {
        key: value
        for key, value in run.items()
        if key not in {"error", "candidate_dir", "candidate_sha256"}
    }
    candidate_dir = run_dir / "candidate"
    staging = run_dir / ".candidate.training"
    config_sha256 = _canonical_sha256(hyperparameters)

    if candidate_dir.exists() or candidate_dir.is_symlink():
        _clear_candidate_staging(run_dir, staging)
        verify_candidate_seal(candidate_dir, prepared.approval_sha256, hyperparameters)
        existing_record = json.loads(
            (candidate_dir / "training-input.json").read_text(encoding="utf-8")
        )
        if existing_record != record:
            raise ValueError("sealed candidate uses different training inputs")
        seal_sha256 = hashlib.sha256(
            (candidate_dir / "candidate-seal.json").read_bytes()
        ).hexdigest()
        if run.get("status") == "pending_quality_review":
            if (
                run.get("candidate_dir") != "candidate"
                or run.get("candidate_sha256") != seal_sha256
                or run.get("training_config_sha256") != config_sha256
            ):
                raise ValueError("run.json disagrees with the sealed candidate")
            _prepared_summary(
                run_dir,
                "pending_quality_review",
                prepared.approval_sha256,
                counts,
            )
            return
        final_run = {
            **clean_run,
            "status": "pending_quality_review",
            "candidate_dir": "candidate",
            "candidate_sha256": seal_sha256,
            "training_config_sha256": config_sha256,
        }
        _atomic_json(run_dir / "run.json", final_run)
        _prepared_summary(
            run_dir,
            "pending_quality_review",
            prepared.approval_sha256,
            counts,
        )
        return

    if run.get("status") == "pending_quality_review":
        raise ValueError("pending_quality_review run is missing its sealed candidate")
    if (
        run.get("status") == "training"
        and run.get("training_config_sha256") != config_sha256
    ):
        raise ValueError("interrupted training used different hyperparameters")
    _clear_candidate_staging(run_dir, staging)
    training_run = {
        **clean_run,
        "status": "training",
        "training_config_sha256": config_sha256,
    }
    _atomic_json(run_dir / "run.json", training_run)

    args.model = base_model
    args.base_revision = prepared.base_revision
    record_bytes = _json_text(record).encode("utf-8")
    record_sha256 = hashlib.sha256(record_bytes).hexdigest()
    try:
        fit_candidate(
            args,
            prepared.datasets.training,
            prepared.datasets.validation,
            prepared.datasets.evaluation,
            staging,
            metadata_extra={
                "training_data_status": "approved_preparation",
                "preparation_version": 1,
                "approval_sha256": prepared.approval_sha256,
                "draft_input_sha256": prepared.approval["draft_input_sha256"],
                "source_manifest_sha256": prepared.source_manifest_sha256,
                "style_profile_sha256": prepared.approval["style_profile_sha256"],
                "facts_sha256": prepared.approval["facts_sha256"],
                "training_input_sha256": record_sha256,
            },
            emit_summary=False,
            strict_evaluation_length=True,
        )
        with (staging / "training-input.json").open("xb") as file:
            file.write(record_bytes)
        results = list(load_results(staging / "evaluation" / "results.jsonl"))
        _json(
            staging / "evaluation" / "training-recall.json",
            training_recall_diagnostics(prepared.datasets, results),
        )
        current = load_prepared_training(run_dir, frozenset({"training"}))
        current_base_model = _canonical_model_name(current.base_model)
        current_record = training_input_record(
            current.datasets,
            approval_sha256=current.approval_sha256,
            source_manifest_sha256=current.source_manifest_sha256,
            base_model=current_base_model,
            base_revision=current.base_revision,
            hyperparameters=hyperparameters,
        )
        if current_record != record:
            raise ValueError("approved training inputs changed during training")
        seal_candidate(staging, prepared.approval_sha256, hyperparameters)
        staging.replace(candidate_dir)
    except BaseException as error:
        _clear_candidate_staging(run_dir, staging)
        if not candidate_dir.exists() and not candidate_dir.is_symlink():
            _atomic_json(
                run_dir / "run.json",
                {
                    **training_run,
                    "status": "training_failed",
                    "error": type(error).__name__,
                },
            )
        raise

    seal_sha256 = hashlib.sha256(
        (candidate_dir / "candidate-seal.json").read_bytes()
    ).hexdigest()
    final_run = {
        **training_run,
        "status": "pending_quality_review",
        "candidate_dir": "candidate",
        "candidate_sha256": seal_sha256,
    }
    _atomic_json(run_dir / "run.json", final_run)
    _prepared_summary(
        run_dir,
        "pending_quality_review",
        prepared.approval_sha256,
        counts,
    )


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
