"""Revalidate approved folder data and seal a private training candidate."""

import os
import re
import stat
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from model.evaluation.case import EvaluationCase
from model.evaluation.result import EvaluationResult
from model.training.folder_data import (
    FactDraft,
    StyleProfile,
    _passages,
    style_profile_from_dict,
)
from model.training.preparation_review import (
    ApprovedPreparation,
    _canonical_json,
    _current_sources,
    _length_prefixed_digest,
    _parse_draft_facts,
    _parse_json,
    _parse_jsonl,
    _read_bytes,
    _sha256,
    approved_artifacts,
    review_preparation,
    verify_approval_bundle,
)
from model.training.supervised import SupervisedExample, ensure_disjoint

_SPLITS = ("train", "validation", "evaluation")
_STYLE_FIELDS = ("tone", "organization", "sentence_style", "formatting")
_DRAFT_NAMES = (
    "preparation.json",
    "style-profile.draft.json",
    "facts.draft.jsonl",
    "automatic-checks.json",
)
_HEX_DIGEST = re.compile(r"[0-9a-f]{64}\Z")
_URL = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_NUMERIC = re.compile(r"(?<!\w)[^\s]*\d[^\s]*(?!\w)")


@dataclass(frozen=True)
class PreparedDatasets:
    training: tuple[SupervisedExample, ...]
    validation: tuple[SupervisedExample, ...]
    evaluation: tuple[EvaluationCase, ...]


@dataclass(frozen=True)
class PreparedTrainingInput:
    datasets: PreparedDatasets
    approval_sha256: str
    source_manifest_sha256: str
    base_model: str
    base_revision: str | None
    approval: dict[str, object]


def _json_object(value: object, description: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise TypeError(f"{description} must contain an object")
    return value


def _digest(value: str, description: str) -> str:
    if not isinstance(value, str) or _HEX_DIGEST.fullmatch(value) is None:
        raise ValueError(f"{description} must be a lowercase SHA-256 digest")
    return value


def _canonical_digest(value: object) -> str:
    return _sha256(_canonical_json(value))


def render_style_profile(profile: StyleProfile) -> str:
    """Render the four approved style categories in one fixed order."""
    return "\n\n".join(
        f"{field_name}:\n"
        + "\n".join(f"- {value}" for value in getattr(profile, field_name))
        for field_name in _STYLE_FIELDS
    )


def _stable_union(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def _case(fact: FactDraft, style: str) -> EvaluationCase:
    statements = tuple(item.statement for item in fact.facts)
    literals = _stable_union(
        literal for item in fact.facts for literal in item.required_literals
    )
    return EvaluationCase(
        id=fact.id,
        request=(
            "주어진 근거의 사실, 숫자, 조건과 부정을 보존하면서 "
            "승인된 문체를 참고해 자연스러운 글을 작성하세요. "
            "근거에 없는 사실은 추가하지 마세요."
        ),
        source_text="\n".join(statements),
        style=style,
        expected_facts=statements,
        schema_version=2,
        literal_facts=literals,
    )


def build_prepared_datasets(approved: ApprovedPreparation) -> PreparedDatasets:
    """Convert every approved fact row without exposing provenance to prompts."""
    validated_style = style_profile_from_dict(
        {
            field_name: list(getattr(approved.style_profile, field_name))
            for field_name in _STYLE_FIELDS
        },
        (),
    )
    style = render_style_profile(validated_style)
    if not style.strip():
        raise ValueError("approved style profile must be nonempty")
    seen_ids: set[str] = set()
    statement_owners: dict[str, str] = {}
    passage_owners: dict[str, str] = {}
    partitions: dict[str, list[FactDraft]] = {name: [] for name in _SPLITS}
    for fact in approved.facts:
        if fact.id in seen_ids:
            raise ValueError(f"duplicate approved fact id: {fact.id}")
        seen_ids.add(fact.id)
        if fact.split not in partitions:
            raise ValueError(f"invalid approved split: {fact.split}")
        if not fact.facts:
            raise ValueError(f"{fact.id}: approved facts must be nonempty")
        if fact.split == "evaluation":
            if fact.target_text is not None:
                raise ValueError(f"{fact.id}: evaluation target must be absent")
        elif fact.target_text != fact.source_passage or not fact.target_text:
            raise ValueError(
                f"{fact.id}: training target must equal Stage 1 source passage"
            )
        passage_key = _normalized(fact.source_passage)
        previous_passage = passage_owners.setdefault(passage_key, fact.id)
        if previous_passage != fact.id:
            raise ValueError("duplicate approved source passage")
        for statement in fact.facts:
            statement_key = _normalized(statement.statement)
            previous_statement = statement_owners.setdefault(statement_key, fact.id)
            if previous_statement != fact.id:
                raise ValueError("duplicate approved fact statement")
        partitions[fact.split].append(fact)

    for split in _SPLITS:
        if not partitions[split]:
            raise ValueError(f"{split} must be nonempty")
    if len(partitions["evaluation"]) < 3:
        raise ValueError("evaluation requires at least 3 approved cases")

    training = tuple(
        SupervisedExample(_case(fact, style), fact.target_text or "")
        for fact in partitions["train"]
    )
    validation = tuple(
        SupervisedExample(_case(fact, style), fact.target_text or "")
        for fact in partitions["validation"]
    )
    evaluation = tuple(_case(fact, style) for fact in partitions["evaluation"])
    ensure_disjoint(training, validation, evaluation)
    return PreparedDatasets(training, validation, evaluation)


def _approved_from_bundle(approved_dir: Path) -> ApprovedPreparation:
    style_data = _json_object(
        _parse_json(
            _read_bytes(approved_dir / "style-profile.approved.json", "approved style"),
            "approved style",
        ),
        "approved style",
    )
    profile = style_profile_from_dict(style_data.get("profile"), ())
    rows = _parse_jsonl(
        _read_bytes(approved_dir / "facts.approved.jsonl", "approved facts"),
        "approved facts",
    )
    facts = _parse_draft_facts(
        [
            {key: value for key, value in row.items() if key != "review_status"}
            for row in rows
            if isinstance(row, dict)
        ]
    )
    approval = verify_approval_bundle(approved_dir)
    sources = style_data.get("source_documents")
    if not isinstance(sources, list):
        raise TypeError("approved style source_documents must be a list")
    return ApprovedPreparation(
        style_profile=profile,
        facts=facts,
        draft_input_sha256=str(approval["draft_input_sha256"]),
        source_manifest_sha256=str(approval["source_manifest_sha256"]),
        style_sources=tuple(dict(item) for item in sources if isinstance(item, dict)),
    )


def load_prepared_training(
    run_dir: Path,
    allowed_statuses: frozenset[str] = frozenset(
        {
            "approved_for_training",
            "training",
            "training_failed",
            "pending_quality_review",
        }
    ),
) -> PreparedTrainingInput:
    """Revalidate the complete Stage 2 input without loading a model."""
    run_dir = Path(run_dir)
    if run_dir.is_symlink() or not run_dir.is_dir():
        raise ValueError("run_dir must be an existing non-symlink directory")
    run = _json_object(
        _parse_json(_read_bytes(run_dir / "run.json", "run.json"), "run.json"),
        "run.json",
    )
    if run.get("schema_version") != 1 or run.get("command") != "prepare-folder":
        raise ValueError("run.json is not a supported folder preparation")
    if run.get("status") not in allowed_statuses:
        raise ValueError("run.json status is not valid for prepared training")
    if run.get("approval_dir") != "approved":
        raise ValueError("run.json approval_dir must be approved")
    approved_dir = run_dir / "approved"
    approval = verify_approval_bundle(approved_dir)
    approval_bytes = _read_bytes(approved_dir / "approval.json", "approval.json")
    approval_sha256 = _sha256(approval_bytes)
    if run.get("approval_sha256") != approval_sha256:
        raise ValueError("run.json approval hash disagrees with the sealed bundle")

    draft_bytes = tuple(_read_bytes(run_dir / name, name) for name in _DRAFT_NAMES)
    if _length_prefixed_digest(draft_bytes) != approval["draft_input_sha256"]:
        raise ValueError("Stage 1 draft input hash changed after approval")
    splits, manifest = _current_sources(run)
    if _canonical_digest(manifest) != approval["source_manifest_sha256"]:
        raise ValueError("current source manifest changed after approval")

    sealed = _approved_from_bundle(approved_dir)
    regenerated = review_preparation(
        run_dir,
        approved_dir / "style-profile.approved.json",
        approved_dir / "facts.approved.jsonl",
    )
    expected = approved_artifacts(regenerated)
    for name, data in expected.items():
        if _read_bytes(approved_dir / name, name) != data:
            raise ValueError(f"normalized approved artifact changed: {name}")
    style_profile_from_dict(
        {
            field_name: list(getattr(regenerated.style_profile, field_name))
            for field_name in _STYLE_FIELDS
        },
        tuple(
            passage
            for split in _SPLITS
            for document in splits[split]
            for passage in _passages(document.text, run["max_chars"])
        ),
    )

    preparation = _json_object(
        _parse_json(draft_bytes[0], "preparation.json"), "preparation.json"
    )
    model = run.get("model")
    revision = preparation.get("extraction_revision")
    if not isinstance(model, str) or not model.strip():
        raise ValueError("run.json model must be a nonblank string")
    if revision is not None and (not isinstance(revision, str) or not revision.strip()):
        raise ValueError("recorded base revision must be null or a nonblank string")
    return PreparedTrainingInput(
        datasets=build_prepared_datasets(sealed),
        approval_sha256=approval_sha256,
        source_manifest_sha256=str(approval["source_manifest_sha256"]),
        base_model=model,
        base_revision=revision,
        approval=approval,
    )


def _dataset_payload(prepared: PreparedDatasets) -> dict[str, object]:
    return {
        "train": [
            {**item.case.to_dict(), "target_text": item.target_text}
            for item in prepared.training
        ],
        "validation": [
            {**item.case.to_dict(), "target_text": item.target_text}
            for item in prepared.validation
        ],
        "evaluation": [item.to_dict() for item in prepared.evaluation],
    }


def training_input_record(
    prepared: PreparedDatasets,
    *,
    approval_sha256: str,
    source_manifest_sha256: str,
    base_model: str,
    base_revision: str | None,
    hyperparameters: dict[str, object],
) -> dict[str, object]:
    """Describe the exact sealed inputs used for one candidate."""
    _digest(approval_sha256, "approval_sha256")
    _digest(source_manifest_sha256, "source_manifest_sha256")
    if not isinstance(base_model, str) or not base_model.strip():
        raise ValueError("base_model must be nonblank")
    if base_revision is not None and (
        not isinstance(base_revision, str) or not base_revision.strip()
    ):
        raise ValueError("base_revision must be null or nonblank")
    dataset_payload = _dataset_payload(prepared)
    return {
        "schema_version": 1,
        "approval_sha256": approval_sha256,
        "source_manifest_sha256": source_manifest_sha256,
        "base_model": base_model,
        "base_revision": base_revision,
        "hyperparameters": hyperparameters,
        "split_counts": {
            "train": len(prepared.training),
            "validation": len(prepared.validation),
            "evaluation": len(prepared.evaluation),
        },
        "dataset_sha256": _canonical_digest(dataset_payload),
    }


def _normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def _trim_token(value: str) -> str:
    return value.strip(".,;:!?()[]{}<>\"'")


def _recall_candidates(prepared: PreparedDatasets) -> dict[str, set[str]]:
    texts = [item.target_text for item in (*prepared.training, *prepared.validation)]
    numeric = {
        token
        for text in texts
        for raw in _NUMERIC.findall(text)
        if (token := _trim_token(raw))
    }
    urls = {
        token
        for text in texts
        for raw in _URL.findall(text)
        if (token := raw.rstrip(".,;:!?)]}"))
    }
    phrases: set[str] = set()
    for text in texts:
        words = _normalized(text).split()
        for width in range(4, min(12, len(words)) + 1):
            for start in range(len(words) - width + 1):
                phrase = " ".join(words[start : start + width])
                if len(phrase) >= 24:
                    phrases.add(phrase)
    return {"numeric_token": numeric, "url": urls, "long_phrase": phrases}


def _recall_hash(kind: str, value: str) -> str:
    return _sha256(f"{kind}\0{_normalized(value)}".encode())


def training_recall_diagnostics(
    prepared: PreparedDatasets, results: Iterable[EvaluationResult]
) -> dict[str, object]:
    """Hash train-only text recalled outside each held-out case's approved facts."""
    result_list = list(results)
    indexed_cases = {case.id: case for case in prepared.evaluation}
    expected = {
        (case.id, approach)
        for case in prepared.evaluation
        for approach in ("prompt_baseline", "lora")
    }
    observed = {(result.case_id, result.approach) for result in result_list}
    if len(observed) != len(result_list) or observed != expected:
        raise ValueError(
            "results must cover every evaluation case and approach exactly"
        )
    base_models = {result.base_model for result in result_list}
    settings = {_canonical_digest(result.generation_settings) for result in result_list}
    if len(base_models) != 1 or len(settings) != 1:
        raise ValueError(
            "baseline and LoRA results must share model and decoding settings"
        )

    candidates = _recall_candidates(prepared)
    checks = []
    ordered = sorted(
        result_list,
        key=lambda item: (
            tuple(indexed_cases).index(item.case_id),
            ("prompt_baseline", "lora").index(item.approach),
        ),
    )
    for result in ordered:
        case = indexed_cases[result.case_id]
        approved_text = "\n".join(case.expected_facts)
        approved_facts = _normalized(approved_text)
        approved_numeric = {
            _normalized(token)
            for raw in _NUMERIC.findall(approved_text)
            if (token := _trim_token(raw))
        }
        approved_urls = {
            _normalized(token)
            for raw in _URL.findall(approved_text)
            if (token := raw.rstrip(".,;:!?)]}"))
        }
        answer = _normalized(result.generated_text)
        answer_numeric = {
            _normalized(token)
            for raw in _NUMERIC.findall(result.generated_text)
            if (token := _trim_token(raw))
        }
        answer_urls = {
            _normalized(token)
            for raw in _URL.findall(result.generated_text)
            if (token := raw.rstrip(".,;:!?)]}"))
        }
        matched: dict[str, list[str]] = {}
        for kind, values in candidates.items():
            matches = {
                _recall_hash(kind, value)
                for value in values
                if (
                    (kind == "numeric_token" and _normalized(value) in answer_numeric)
                    or (kind == "url" and _normalized(value) in answer_urls)
                    or (kind == "long_phrase" and _normalized(value) in answer)
                )
                and (
                    (
                        kind == "numeric_token"
                        and _normalized(value) not in approved_numeric
                    )
                    or (kind == "url" and _normalized(value) not in approved_urls)
                    or (
                        kind == "long_phrase"
                        and _normalized(value) not in approved_facts
                    )
                )
            }
            matched[f"{kind}_sha256"] = sorted(matches)
        checks.append(
            {
                "case_id": result.case_id,
                "approach": result.approach,
                **matched,
            }
        )
    return {
        "schema_version": 1,
        "diagnostics_only": True,
        "automatic_checks_establish_quality": False,
        "checks": checks,
    }


_REVIEW_DERIVED_FILES = {
    "evaluation/final-report.json",
    "evaluation/blind-comparisons.json",
    "evaluation/blind-mapping.json",
    "evaluation/review-invalidated.json",
}


def _candidate_entries(
    candidate_dir: Path, *, allow_review_outputs: bool = False
) -> tuple[list[Path], list[Path], list[Path]]:
    directories: list[Path] = []
    files: list[Path] = []
    review_outputs: list[Path] = []
    for directory, names, filenames in os.walk(candidate_dir, followlinks=False):
        current = Path(directory)
        for name in sorted(names):
            path = current / name
            if path.is_symlink():
                raise ValueError(f"candidate contains a symlink: {path}")
            if not path.is_dir():
                raise ValueError(f"candidate contains a non-directory entry: {path}")
            directories.append(path)
        for name in sorted(filenames):
            path = current / name
            if path.is_symlink():
                raise ValueError(f"candidate contains a symlink: {path}")
            if not path.is_file():
                raise ValueError(f"candidate contains a non-regular file: {path}")
            relative = path.relative_to(candidate_dir).as_posix()
            if relative in _REVIEW_DERIVED_FILES:
                if not allow_review_outputs:
                    raise ValueError("unpublished candidate contains review outputs")
                review_outputs.append(path)
            elif path != candidate_dir / "candidate-seal.json":
                files.append(path)
    return directories, files, review_outputs


_ROOT_CANDIDATE_FILES = {
    "adapter.json",
    "adapter.pt",
    "metrics.json",
    "training-input.json",
}
_EVALUATION_FILES = {
    "cases.jsonl",
    "results.jsonl",
    "reviews.template.jsonl",
    "automatic-checks.json",
    "report.json",
    "training-recall.json",
}


def _validate_candidate_layout(
    candidate_dir: Path, approval_sha256: str, config_sha256: str
) -> None:
    for name in _ROOT_CANDIDATE_FILES:
        path = candidate_dir / name
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"candidate is missing required file: {name}")
    tokenizer = candidate_dir / "tokenizer"
    if tokenizer.is_symlink() or not tokenizer.is_dir():
        raise ValueError("candidate is missing tokenizer directory")
    tokenizer_files = [path for path in tokenizer.rglob("*") if path.is_file()]
    if not tokenizer_files:
        raise ValueError("candidate tokenizer directory must be nonempty")
    evaluation = candidate_dir / "evaluation"
    if evaluation.is_symlink() or not evaluation.is_dir():
        raise ValueError("candidate is missing evaluation directory")
    for name in _EVALUATION_FILES:
        path = evaluation / name
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"candidate evaluation is missing required file: {name}")
    metadata = _json_object(
        _parse_json(
            _read_bytes(candidate_dir / "adapter.json", "adapter metadata"),
            "adapter metadata",
        ),
        "adapter metadata",
    )
    if metadata.get("status") != "candidate":
        raise ValueError("adapter metadata status must be candidate")
    if metadata.get("active") is not False:
        raise ValueError("adapter metadata active must be false")
    if metadata.get("quality_status") != "pending_review":
        raise ValueError("adapter metadata quality_status must be pending_review")
    if metadata.get("approval_sha256") != approval_sha256:
        raise ValueError("adapter metadata approval hash mismatch")
    training_input = _json_object(
        _parse_json(
            _read_bytes(candidate_dir / "training-input.json", "training input"),
            "training input",
        ),
        "training input",
    )
    required_input = {
        "schema_version",
        "approval_sha256",
        "source_manifest_sha256",
        "base_model",
        "base_revision",
        "hyperparameters",
        "split_counts",
        "dataset_sha256",
    }
    if (
        set(training_input) != required_input
        or training_input.get("schema_version") != 1
    ):
        raise ValueError("training input schema is invalid")
    if training_input.get("approval_sha256") != approval_sha256:
        raise ValueError("training input approval hash mismatch")
    if _canonical_digest(training_input.get("hyperparameters")) != config_sha256:
        raise ValueError("training input config hash mismatch")
    _digest(training_input.get("source_manifest_sha256"), "source manifest hash")  # type: ignore[arg-type]
    _digest(training_input.get("dataset_sha256"), "dataset hash")  # type: ignore[arg-type]
    training_input_sha256 = _sha256(
        _read_bytes(candidate_dir / "training-input.json", "training input")
    )
    metadata_bindings = {
        "approval_sha256": training_input.get("approval_sha256"),
        "source_manifest_sha256": training_input.get("source_manifest_sha256"),
        "base_model": training_input.get("base_model"),
        "base_revision": training_input.get("base_revision"),
        "training_input_sha256": training_input_sha256,
    }
    for name, expected in metadata_bindings.items():
        if metadata.get(name) != expected:
            raise ValueError(f"adapter metadata {name} mismatch")


def _private(candidate_dir: Path, directories: list[Path], files: list[Path]) -> None:
    candidate_dir.chmod(0o700)
    for path in directories:
        path.chmod(0o700)
    for path in files:
        path.chmod(0o600)


def seal_candidate(
    candidate_dir: Path, approval_sha256: str, config: dict[str, object]
) -> dict[str, object]:
    """Recursively hash and privatize a complete unpublished candidate."""
    candidate_dir = Path(candidate_dir)
    if candidate_dir.is_symlink() or not candidate_dir.is_dir():
        raise ValueError("candidate_dir must be an existing non-symlink directory")
    _digest(approval_sha256, "approval_sha256")
    seal_path = candidate_dir / "candidate-seal.json"
    if seal_path.exists() or seal_path.is_symlink():
        raise ValueError("candidate seal already exists")
    config_sha256 = _canonical_digest(config)
    _validate_candidate_layout(candidate_dir, approval_sha256, config_sha256)
    directories, files, _ = _candidate_entries(candidate_dir)
    if not files:
        raise ValueError("candidate must contain at least one file")
    file_hashes = {
        path.relative_to(candidate_dir).as_posix(): _sha256(
            _read_bytes(path, "candidate file")
        )
        for path in sorted(files)
    }
    training_input_hash = file_hashes.get("training-input.json")
    if training_input_hash is None:
        raise ValueError("candidate must contain training-input.json")
    seal: dict[str, object] = {
        "schema_version": 1,
        "approval_sha256": approval_sha256,
        "config_sha256": config_sha256,
        "training_input_sha256": training_input_hash,
        "files": file_hashes,
    }
    _private(candidate_dir, directories, files)
    with seal_path.open("xb") as file:
        file.write(_canonical_json(seal))
    seal_path.chmod(0o600)
    return seal


def verify_candidate_seal(
    candidate_dir: Path,
    approval_sha256: str | None = None,
    config: dict[str, object] | None = None,
) -> dict[str, object]:
    """Verify the recursive seal, privacy modes, approval, and training config."""
    candidate_dir = Path(candidate_dir)
    if candidate_dir.is_symlink() or not candidate_dir.is_dir():
        raise ValueError("candidate_dir must be an existing non-symlink directory")
    if stat.S_IMODE(candidate_dir.stat().st_mode) != 0o700:
        raise ValueError("candidate directory mode must be 0700")
    seal_path = candidate_dir / "candidate-seal.json"
    seal = _json_object(
        _parse_json(_read_bytes(seal_path, "candidate seal"), "candidate seal"),
        "candidate seal",
    )
    required = {
        "schema_version",
        "approval_sha256",
        "config_sha256",
        "training_input_sha256",
        "files",
    }
    if set(seal) != required or seal.get("schema_version") != 1:
        raise ValueError("candidate seal schema is invalid")
    for name in ("approval_sha256", "config_sha256", "training_input_sha256"):
        _digest(seal.get(name), f"candidate seal {name}")  # type: ignore[arg-type]
    if approval_sha256 is not None and seal["approval_sha256"] != approval_sha256:
        raise ValueError("candidate approval hash mismatch")
    if config is not None and seal["config_sha256"] != _canonical_digest(config):
        raise ValueError("candidate config hash mismatch")

    _validate_candidate_layout(
        candidate_dir,
        str(seal["approval_sha256"]),
        str(seal["config_sha256"]),
    )
    directories, files, review_outputs = _candidate_entries(
        candidate_dir, allow_review_outputs=True
    )
    if stat.S_IMODE(seal_path.stat().st_mode) != 0o600:
        raise ValueError("candidate seal mode must be 0600")
    if any(stat.S_IMODE(path.stat().st_mode) != 0o700 for path in directories):
        raise ValueError("candidate directory entries must use mode 0700")
    if any(stat.S_IMODE(path.stat().st_mode) != 0o600 for path in files):
        raise ValueError("candidate file entries must use mode 0600")
    if any(stat.S_IMODE(path.stat().st_mode) != 0o600 for path in review_outputs):
        raise ValueError("candidate review outputs must use mode 0600")
    expected_files = seal.get("files")
    if not isinstance(expected_files, dict) or any(
        not isinstance(name, str) or not isinstance(digest, str)
        for name, digest in expected_files.items()
    ):
        raise TypeError("candidate seal files must map paths to hashes")
    for digest in expected_files.values():
        _digest(digest, "candidate file hash")
    actual_names = {path.relative_to(candidate_dir).as_posix() for path in files}
    if actual_names != set(expected_files):
        raise ValueError("candidate file set mismatch")
    for path in files:
        name = path.relative_to(candidate_dir).as_posix()
        if _sha256(_read_bytes(path, "candidate file")) != expected_files[name]:
            raise ValueError(f"candidate file hash mismatch: {name}")
    if expected_files.get("training-input.json") != seal["training_input_sha256"]:
        raise ValueError("candidate training-input hash mismatch")
    return seal
