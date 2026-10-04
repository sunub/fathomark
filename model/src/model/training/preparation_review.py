"""Validate human-reviewed folder preparation and build sealed artifacts."""

import hashlib
import json
import os
import stat
from dataclasses import asdict, dataclass
from pathlib import Path

from model.training.corpus import Document, load_documents
from model.training.folder_data import (
    FactDraft,
    StyleProfile,
    _normalize,
    _passages,
    fact_statements_from_rows,
    split_preparation_documents,
    style_profile_from_dict,
)

_DRAFT_NAMES = (
    "preparation.json",
    "style-profile.draft.json",
    "facts.draft.jsonl",
    "automatic-checks.json",
)
_SPLITS = ("train", "validation", "evaluation")
_FACT_IMMUTABLE_FIELDS = (
    "id",
    "split",
    "source_document",
    "passage_index",
    "source_passage",
    "target_text",
)


@dataclass(frozen=True)
class ApprovedPreparation:
    style_profile: StyleProfile
    facts: tuple[FactDraft, ...]
    draft_input_sha256: str
    source_manifest_sha256: str
    style_sources: tuple[dict[str, str], ...] = ()


def _read_bytes(path: Path, description: str) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"{description} must be a regular non-symlink file")
    try:
        return path.read_bytes()
    except OSError as error:
        raise ValueError(f"Cannot read {description}: {error}") from error


def _decode_utf8(data: bytes, description: str) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"{description} must be valid UTF-8") from error


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON value is not allowed: {value}")


def _parse_json(data: bytes, description: str) -> object:
    try:
        return json.loads(
            _decode_utf8(data, description), parse_constant=_reject_constant
        )
    except json.JSONDecodeError as error:
        raise ValueError(f"Malformed JSON in {description}: {error}") from error


def _parse_jsonl(data: bytes, description: str) -> list[object]:
    text = _decode_utf8(data, description)
    rows = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            raise ValueError(f"{description} contains a blank JSONL row")
        try:
            rows.append(json.loads(line, parse_constant=_reject_constant))
        except json.JSONDecodeError as error:
            raise ValueError(
                f"Malformed JSONL in {description} at line {line_number}: {error}"
            ) from error
    if not rows:
        raise ValueError(f"{description} must contain at least one row")
    return rows


def _object(value: object, description: str, fields: set[str]) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError(f"{description} must contain exactly {sorted(fields)}")
    return value


def _schema_one(value: object, description: str) -> None:
    if isinstance(value, bool) or value != 1:
        raise ValueError(f"Unsupported {description} schema version")


def _canonical_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def _pretty_json(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    ).encode("utf-8")


def _length_prefixed_digest(parts: tuple[bytes, ...]) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(len(part).to_bytes(8, "big"))
        digest.update(part)
    return digest.hexdigest()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _visible_source_paths(folder: Path, *, exclude_evaluation: bool) -> list[Path]:
    paths: list[Path] = []
    for directory, directories, filenames in os.walk(folder, followlinks=False):
        directory_path = Path(directory)
        relative = directory_path.relative_to(folder)
        kept_directories = []
        for name in sorted(directories):
            child = directory_path / name
            child_relative = relative / name
            if name.startswith(".") or (
                exclude_evaluation and child_relative.as_posix() == "evaluation"
            ):
                continue
            if child.is_symlink():
                raise ValueError(f"Source corpus contains a symlink: {child}")
            kept_directories.append(name)
        directories[:] = kept_directories
        for name in sorted(filenames):
            if name.startswith(".") or Path(name).suffix.lower() not in {".md", ".txt"}:
                continue
            path = directory_path / name
            if path.is_symlink():
                raise ValueError(f"Source corpus contains a symlink: {path}")
            paths.append(path)
    return paths


def _strict_documents(
    folder: Path, *, exclude_evaluation: bool = False
) -> list[Document]:
    visible = _visible_source_paths(folder, exclude_evaluation=exclude_evaluation)
    excluded = frozenset({"evaluation"}) if exclude_evaluation else frozenset()
    documents = load_documents(folder, excluded_relative_dirs=excluded)
    loaded_paths = {item.path for item in documents}
    visible_paths = {path.relative_to(folder).as_posix() for path in visible}
    if loaded_paths != visible_paths:
        raise ValueError("Source corpus contains an empty or duplicate document")
    return documents


def _current_sources(run: dict[str, object]) -> tuple[dict[str, list[Document]], dict]:
    input_dir_value = run.get("input_dir")
    seed = run.get("seed")
    if not isinstance(input_dir_value, str) or not input_dir_value:
        raise ValueError("run.json input_dir must be a nonempty string")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise TypeError("run.json seed must be an integer")
    input_dir = Path(input_dir_value)
    if input_dir.is_symlink() or not input_dir.is_dir():
        raise ValueError("run.json input_dir must be an existing non-symlink directory")
    evaluation_dir = input_dir / "evaluation"
    if evaluation_dir.is_symlink() or not evaluation_dir.is_dir():
        raise ValueError("Source corpus requires a real evaluation directory")
    training = _strict_documents(input_dir, exclude_evaluation=True)
    evaluation = [
        Document(f"evaluation/{item.path}", item.text, item.sha256)
        for item in _strict_documents(evaluation_dir)
    ]
    splits = split_preparation_documents(training, evaluation, seed)
    manifest = {
        split: [
            {"path": document.path, "sha256": document.sha256}
            for document in splits[split]
        ]
        for split in _SPLITS
    }
    return splits, manifest


def _validate_run(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise TypeError("run.json must contain an object")
    _schema_one(value.get("schema_version"), "run")
    if value.get("command") != "prepare-folder":
        raise ValueError("run.json command must be prepare-folder")
    if value.get("status") not in {
        "pending_preparation_review",
        "approved_for_training",
        "training",
        "training_failed",
        "pending_quality_review",
    }:
        raise ValueError("run.json status is not valid for preparation verification")
    max_chars = value.get("max_chars")
    if isinstance(max_chars, bool) or not isinstance(max_chars, int) or max_chars < 1:
        raise ValueError("run.json max_chars must be a positive integer")
    return value


def _validate_preparation(value: object) -> dict[str, object]:
    required = {
        "schema_version",
        "documents",
        "samples",
        "skipped",
        "automatic_checks_only",
        "semantic_review",
        "extraction_model",
        "extraction_revision",
    }
    data = _object(value, "preparation.json", required)
    _schema_one(data["schema_version"], "preparation")
    if (
        data["automatic_checks_only"] is not True
        or data["semantic_review"] != "pending"
    ):
        raise ValueError("preparation.json is not pending automatic-only preparation")
    if not isinstance(data["skipped"], list):
        raise TypeError("preparation.json skipped must be a list")
    return data


def _source_document(value: object, description: str) -> dict[str, str]:
    data = _object(value, description, {"path", "sha256"})
    if (
        not isinstance(data["path"], str)
        or not data["path"]
        or not isinstance(data["sha256"], str)
        or len(data["sha256"]) != 64
        or any(character not in "0123456789abcdef" for character in data["sha256"])
    ):
        raise ValueError(f"{description} contains invalid provenance")
    return {"path": data["path"], "sha256": data["sha256"]}


def _parse_draft_facts(rows: list[object]) -> tuple[FactDraft, ...]:
    facts = []
    seen_ids = set()
    fields = {*_FACT_IMMUTABLE_FIELDS, "facts"}
    for index, value in enumerate(rows):
        row = _object(value, f"draft fact row {index}", fields)
        identifier = row["id"]
        split = row["split"]
        passage_index = row["passage_index"]
        source_passage = row["source_passage"]
        target_text = row["target_text"]
        if not isinstance(identifier, str) or not identifier.startswith("folder-"):
            raise ValueError("draft fact id is invalid")
        if identifier in seen_ids:
            raise ValueError("draft facts contain a duplicate id")
        seen_ids.add(identifier)
        if split not in _SPLITS:
            raise ValueError("draft fact split is invalid")
        if (
            isinstance(passage_index, bool)
            or not isinstance(passage_index, int)
            or passage_index < 0
            or not isinstance(source_passage, str)
            or not source_passage
        ):
            raise ValueError("draft fact passage provenance is invalid")
        if (split == "evaluation" and target_text is not None) or (
            split != "evaluation" and target_text != source_passage
        ):
            raise ValueError("draft fact target_text is invalid for its split")
        source = _source_document(row["source_document"], "draft source_document")
        statements = fact_statements_from_rows(row["facts"], source_passage)
        normalized_statements = [
            {
                "statement": statement.statement,
                "evidence_spans": list(statement.evidence_spans),
                "required_literals": list(statement.required_literals),
            }
            for statement in statements
        ]
        if row["facts"] != normalized_statements:
            raise ValueError(
                "draft fact literals do not match deterministic validation"
            )
        expected_id = (
            "folder-"
            + hashlib.sha256(
                (source["sha256"] + "\0" + source_passage).encode("utf-8")
            ).hexdigest()
        )
        if identifier != expected_id:
            raise ValueError("draft fact id does not match its immutable provenance")
        facts.append(
            FactDraft(
                identifier,
                split,
                source,
                passage_index,
                source_passage,
                statements,
                target_text,
            )
        )
    return tuple(facts)


def _validate_stage_one_consistency(
    preparation: dict[str, object],
    checks_value: object,
    facts: tuple[FactDraft, ...],
    style_sources: tuple[dict[str, str], ...],
    splits: dict[str, list[Document]],
    max_chars: int,
) -> None:
    checks = _object(
        checks_value,
        "automatic-checks.json",
        {"schema_version", "automatic_checks_establish_semantic_approval", "checks"},
    )
    _schema_one(checks["schema_version"], "automatic checks")
    if checks["automatic_checks_establish_semantic_approval"] is not False:
        raise ValueError("automatic checks must not establish semantic approval")
    if not isinstance(checks["checks"], list):
        raise TypeError("automatic checks must be a list")

    passages = {
        (split, document.path, index): (document.sha256, passage)
        for split in _SPLITS
        for document in splits[split]
        for index, passage in enumerate(_passages(document.text, max_chars))
    }
    fact_by_location = {
        (fact.split, fact.source_document["path"], fact.passage_index): fact
        for fact in facts
    }
    if len(fact_by_location) != len(facts):
        raise ValueError("draft facts contain duplicate source passage provenance")
    for location, fact in fact_by_location.items():
        expected = passages.get(location)
        if (
            expected is None
            or fact.source_document["sha256"] != expected[0]
            or fact.source_passage != expected[1]
        ):
            raise ValueError("draft fact provenance does not match source corpus")

    observed_grounded = set()
    observed_style = set()
    failed_grounded = []
    passed_style_sources = {}
    for value in checks["checks"]:
        if not isinstance(value, dict):
            raise TypeError("automatic check rows must be objects")
        kind = value.get("check")
        status_value = value.get("status")
        required = {"check", "source_document", "passage_index", "status"}
        if kind == "grounded_fact_structure":
            required.add("split")
        elif kind != "style_profile_leakage":
            raise ValueError("automatic check type is invalid")
        if status_value == "failed":
            required.add("reason")
            if not isinstance(value.get("reason"), str) or not value["reason"]:
                raise ValueError("failed automatic check needs a reason")
        elif status_value != "passed":
            raise ValueError("automatic check status is invalid")
        if set(value) != required:
            raise ValueError("automatic check metadata does not match its schema")
        source = _source_document(value["source_document"], "automatic check source")
        index = value["passage_index"]
        if isinstance(index, bool) or not isinstance(index, int) or index < 0:
            raise ValueError("automatic check passage index is invalid")
        split = value.get("split", "train")
        location = (split, source["path"], index)
        expected = passages.get(location)
        if expected is None or expected[0] != source["sha256"]:
            raise ValueError("automatic check provenance does not match source corpus")
        if kind == "grounded_fact_structure":
            if location in observed_grounded:
                raise ValueError("duplicate grounded automatic check")
            observed_grounded.add(location)
            if (location in fact_by_location) != (status_value == "passed"):
                raise ValueError("automatic checks disagree with draft facts")
            if status_value == "failed":
                failed_grounded.append(
                    {
                        "check": "grounded_fact_structure",
                        "split": split,
                        "source_document": source,
                        "passage_index": index,
                        "reason": value["reason"],
                    }
                )
        else:
            style_location = (source["path"], index)
            if style_location in observed_style:
                raise ValueError("duplicate style automatic check")
            observed_style.add(style_location)
            if status_value == "passed":
                passed_style_sources[source["path"]] = source

    expected_grounded = set(passages)
    expected_style = {
        (document.path, index)
        for document in splits["train"]
        for index, _ in enumerate(_passages(document.text, max_chars))
    }
    if observed_grounded != expected_grounded or observed_style != expected_style:
        raise ValueError("automatic checks do not cover every Stage 1 passage")
    if preparation["skipped"] != failed_grounded:
        raise ValueError("preparation skipped metadata disagrees with automatic checks")
    if (
        tuple(passed_style_sources[path] for path in sorted(passed_style_sources))
        != style_sources
    ):
        raise ValueError("style source metadata disagrees with automatic checks")
    expected_samples = {
        split: sum(fact.split == split for fact in facts) for split in _SPLITS
    }
    if preparation["samples"] != expected_samples:
        raise ValueError("preparation sample counts disagree with draft facts")


def review_preparation(
    run_dir: Path, style_path: Path, facts_path: Path
) -> ApprovedPreparation:
    """Validate reviewed inputs against an unchanged Stage 1 preparation."""
    run_dir = Path(run_dir)
    style_path = Path(style_path)
    facts_path = Path(facts_path)
    if run_dir.is_symlink() or not run_dir.is_dir():
        raise ValueError("run_dir must be an existing non-symlink directory")
    run_data = _read_bytes(run_dir / "run.json", "run.json")
    run = _validate_run(_parse_json(run_data, "run.json"))
    draft_bytes = tuple(_read_bytes(run_dir / name, name) for name in _DRAFT_NAMES)
    preparation = _validate_preparation(_parse_json(draft_bytes[0], "preparation.json"))
    draft_style = _object(
        _parse_json(draft_bytes[1], "style-profile.draft.json"),
        "style-profile.draft.json",
        {"schema_version", "status", "source_documents", "profile"},
    )
    _schema_one(draft_style["schema_version"], "draft style profile")
    if draft_style["status"] != "pending_review":
        raise ValueError("draft style profile status must be pending_review")
    if not isinstance(draft_style["source_documents"], list):
        raise TypeError("draft style source_documents must be a list")
    style_sources = tuple(
        _source_document(item, "draft style source")
        for item in draft_style["source_documents"]
    )
    if not style_sources or len({item["path"] for item in style_sources}) != len(
        style_sources
    ):
        raise ValueError("draft style sources must be nonempty and unique")

    draft_facts = _parse_draft_facts(_parse_jsonl(draft_bytes[2], "facts.draft.jsonl"))
    splits, manifest = _current_sources(run)
    if preparation["documents"] != manifest:
        raise ValueError("Current source manifest differs from Stage 1 preparation")
    max_chars = run["max_chars"]
    _validate_stage_one_consistency(
        preparation,
        _parse_json(draft_bytes[3], "automatic-checks.json"),
        draft_facts,
        style_sources,
        splits,
        max_chars,
    )

    training_passages = tuple(
        passage
        for document in splits["train"]
        for passage in _passages(document.text, max_chars)
    )
    style_profile_from_dict(draft_style["profile"], ())
    reviewed_style = _object(
        _parse_json(
            _read_bytes(style_path, "reviewed style profile"), "reviewed style profile"
        ),
        "reviewed style profile",
        {"schema_version", "status", "source_documents", "profile"},
    )
    _schema_one(reviewed_style["schema_version"], "reviewed style profile")
    if reviewed_style["status"] != "approved":
        raise ValueError("reviewed style profile must have approved status")
    if reviewed_style["source_documents"] != draft_style["source_documents"]:
        raise ValueError("reviewed style profile changed source_documents")
    reviewed_profile = style_profile_from_dict(
        reviewed_style["profile"], training_passages
    )

    reviewed_rows = _parse_jsonl(
        _read_bytes(facts_path, "reviewed facts"), "reviewed facts"
    )
    by_id: dict[str, dict[str, object]] = {}
    reviewed_fields = {*_FACT_IMMUTABLE_FIELDS, "facts", "review_status"}
    for index, value in enumerate(reviewed_rows):
        row = _object(value, f"reviewed fact row {index}", reviewed_fields)
        identifier = row["id"]
        if not isinstance(identifier, str):
            raise TypeError("reviewed fact id must be a string")
        if identifier in by_id:
            raise ValueError("reviewed facts contain a duplicate id")
        if row["review_status"] != "approved":
            raise ValueError("every reviewed fact must be explicitly approved")
        by_id[identifier] = row
    draft_ids = {fact.id for fact in draft_facts}
    if set(by_id) != draft_ids:
        missing = sorted(draft_ids - set(by_id))
        unknown = sorted(set(by_id) - draft_ids)
        raise ValueError(
            f"reviewed fact coverage mismatch; missing={missing}, unknown={unknown}"
        )

    approved_facts = []
    seen_statement_sets = set()
    for draft in draft_facts:
        row = by_id[draft.id]
        draft_values = asdict(draft)
        for field_name in _FACT_IMMUTABLE_FIELDS:
            if (
                type(row[field_name]) is not type(draft_values[field_name])
                or row[field_name] != draft_values[field_name]
            ):
                raise ValueError(f"reviewed fact changed immutable field {field_name}")
        raw_facts = row["facts"]
        if not isinstance(raw_facts, list):
            raise TypeError("reviewed facts field must be a list")
        validator_rows = []
        for fact in raw_facts:
            if (
                not isinstance(fact, dict)
                or not set(fact).issubset(
                    {"statement", "evidence_spans", "required_literals"}
                )
                or not {"statement", "evidence_spans"}.issubset(fact)
            ):
                raise ValueError("reviewed fact statements have invalid fields")
            validator_rows.append(
                {
                    "statement": fact["statement"],
                    "evidence_spans": fact["evidence_spans"],
                }
            )
        statements = fact_statements_from_rows(validator_rows, draft.source_passage)
        statement_key = frozenset(_normalize(item.statement) for item in statements)
        if statement_key in seen_statement_sets:
            raise ValueError("duplicate normalized fact statements across splits")
        seen_statement_sets.add(statement_key)
        approved_facts.append(
            FactDraft(
                draft.id,
                draft.split,
                draft.source_document,
                draft.passage_index,
                draft.source_passage,
                statements,
                draft.target_text,
            )
        )

    return ApprovedPreparation(
        style_profile=reviewed_profile,
        facts=tuple(approved_facts),
        draft_input_sha256=_length_prefixed_digest(draft_bytes),
        source_manifest_sha256=_sha256(_canonical_json(manifest)),
        style_sources=style_sources,
    )


def approved_artifacts(approved: ApprovedPreparation) -> dict[str, bytes]:
    """Render normalized approved files and their byte-exact approval seal."""
    style_bytes = _pretty_json(
        {
            "schema_version": 1,
            "status": "approved",
            "source_documents": list(approved.style_sources),
            "profile": asdict(approved.style_profile),
        }
    )
    facts_bytes = b"".join(
        _canonical_json({**asdict(fact), "review_status": "approved"})
        for fact in approved.facts
    )
    approval_bytes = _pretty_json(
        {
            "schema_version": 1,
            "status": "approved_for_training",
            "draft_input_sha256": approved.draft_input_sha256,
            "source_manifest_sha256": approved.source_manifest_sha256,
            "style_profile_sha256": _sha256(style_bytes),
            "facts_sha256": _sha256(facts_bytes),
        }
    )
    return {
        "style-profile.approved.json": style_bytes,
        "facts.approved.jsonl": facts_bytes,
        "approval.json": approval_bytes,
    }


def verify_approval_bundle(approved_dir: Path) -> dict[str, object]:
    """Verify a private, complete approval bundle and return its seal object."""
    approved_dir = Path(approved_dir)
    if approved_dir.is_symlink() or not approved_dir.is_dir():
        raise ValueError("approved_dir must be a non-symlink directory")
    expected_names = {
        "style-profile.approved.json",
        "facts.approved.jsonl",
        "approval.json",
    }
    if {path.name for path in approved_dir.iterdir()} != expected_names:
        raise ValueError("approval bundle contains missing or unexpected files")
    if stat.S_IMODE(approved_dir.stat().st_mode) != 0o700:
        raise ValueError("approval bundle directory mode must be 0700")
    data = {name: _read_bytes(approved_dir / name, name) for name in expected_names}
    if any(
        stat.S_IMODE((approved_dir / name).stat().st_mode) != 0o600
        for name in expected_names
    ):
        raise ValueError("approval bundle file modes must be 0600")
    style = _object(
        _parse_json(data["style-profile.approved.json"], "approved style profile"),
        "approved style profile",
        {"schema_version", "status", "source_documents", "profile"},
    )
    _schema_one(style["schema_version"], "approved style profile")
    if style["status"] != "approved":
        raise ValueError("approved style profile status is invalid")
    if not isinstance(style["source_documents"], list):
        raise TypeError("approved style source_documents must be a list")
    for item in style["source_documents"]:
        _source_document(item, "approved style source")
    style_profile_from_dict(style["profile"], ())
    facts = _parse_jsonl(data["facts.approved.jsonl"], "approved facts")
    draft_rows = []
    for row in facts:
        if not isinstance(row, dict) or row.get("review_status") != "approved":
            raise ValueError("approved facts contain an unapproved row")
        if set(row) != {*_FACT_IMMUTABLE_FIELDS, "facts", "review_status"}:
            raise ValueError("approved facts contain invalid fields")
        draft_rows.append(
            {key: value for key, value in row.items() if key != "review_status"}
        )
    parsed_facts = _parse_draft_facts(draft_rows)
    statement_sets = [
        frozenset(_normalize(item.statement) for item in fact.facts)
        for fact in parsed_facts
    ]
    if len(statement_sets) != len(set(statement_sets)):
        raise ValueError("approved facts contain duplicate normalized statements")
    approval = _object(
        _parse_json(data["approval.json"], "approval.json"),
        "approval.json",
        {
            "schema_version",
            "status",
            "draft_input_sha256",
            "source_manifest_sha256",
            "style_profile_sha256",
            "facts_sha256",
        },
    )
    _schema_one(approval["schema_version"], "approval")
    if approval["status"] != "approved_for_training":
        raise ValueError("approval status is invalid")
    for field_name in (
        "draft_input_sha256",
        "source_manifest_sha256",
        "style_profile_sha256",
        "facts_sha256",
    ):
        value = approval[field_name]
        if (
            not isinstance(value, str)
            or len(value) != 64
            or any(character not in "0123456789abcdef" for character in value)
        ):
            raise ValueError(f"approval {field_name} is invalid")
    if approval["style_profile_sha256"] != _sha256(data["style-profile.approved.json"]):
        raise ValueError("approved style profile hash mismatch")
    if approval["facts_sha256"] != _sha256(data["facts.approved.jsonl"]):
        raise ValueError("approved facts hash mismatch")
    return approval
