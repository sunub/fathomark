"""Quality-reviewed instruction targets and leakage-safe dataset partitions."""

import hashlib
import json
import unicodedata
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

from model.evaluation.assessment import ResponseAssessment
from model.evaluation.case import EvaluationCase


@dataclass(frozen=True)
class SupervisedExample:
    case: EvaluationCase
    target_text: str


def target_fingerprint(case: EvaluationCase, target_text: str) -> str:
    payload = {**case.to_dict(), "target_text": target_text}
    canonical = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _validated_rows(path: Path):
    rows = []
    seen = set()
    with path.open(encoding="utf-8") as file:
        for line_number, line in enumerate(file, 1):
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                if not isinstance(data, dict):
                    raise TypeError("each line must contain a JSON object")
                case = EvaluationCase.from_dict(data)
                for name in ("id", "request", "source_text", "style"):
                    if not getattr(case, name).strip():
                        raise ValueError(f"{name} must not be blank")
                if not case.expected_facts or any(
                    not fact.strip() for fact in case.expected_facts
                ):
                    raise ValueError("expected_facts must contain nonempty facts")
                target = data.get("target_text")
                if not isinstance(target, str) or not target.strip():
                    raise ValueError("target_text must not be blank")
                if any(fact not in target for fact in case.required_literals()):
                    raise ValueError(
                        "target_text must preserve every required literal fact literally"
                    )
                if case.id in seen:
                    raise ValueError(f"duplicate case id: {case.id}")
                seen.add(case.id)
                rows.append((line_number, SupervisedExample(case, target), data))
            except (json.JSONDecodeError, ValueError, TypeError) as error:
                raise ValueError(
                    f"{path}:{line_number}: invalid supervised example: {error}"
                ) from error
    if not rows:
        raise ValueError(f"{path}: needs nonempty supervised examples")
    return rows


def load_supervised(path: Path) -> list[SupervisedExample]:
    """Accept only passing external reviews bound to the exact input and answer."""
    examples = []
    for line_number, example, data in _validated_rows(path):
        try:
            review = data.get("target_review")
            if not isinstance(review, dict):
                raise TypeError("target_review must contain an external quality review")
            if review.get("target_sha256") != target_fingerprint(
                example.case, example.target_text
            ):
                raise ValueError(
                    "target_sha256 is missing or stale; review this exact case and target again"
                )
            assessment = ResponseAssessment.from_dict(
                {"case_id": example.case.id, "approach": "lora", **review}
            )
            if (
                assessment.case_id != example.case.id
                or not assessment.eligible_for_preference
            ):
                raise ValueError(
                    "target_review must match the case and pass all quality checks"
                )
            examples.append(example)
        except (ValueError, TypeError) as error:
            raise ValueError(
                f"{path}:{line_number}: invalid supervised example: {error}"
            ) from error
    return examples


def prepare_target_reviews(input_path: Path, output_path: Path) -> int:
    """Create pending review records, discarding any previous approvals."""
    rows = _validated_rows(input_path)
    with output_path.open("x", encoding="utf-8") as file:
        for _, example, _ in rows:
            review = {
                "grounding_passed": None,
                "facts_preserved": None,
                "conflicts_handled": None,
                "safety_passed": None,
                "unsupported_claims": [],
                "target_sha256": target_fingerprint(example.case, example.target_text),
            }
            record = {
                **example.case.to_dict(),
                "target_text": example.target_text,
                "target_review": review,
            }
            file.write(json.dumps(record, ensure_ascii=False) + "\n")
    return len(rows)


def build_supervised_samples(examples, tokenizer, max_length=1024):
    """Mask instruction tokens; reject oversized records instead of losing facts."""
    from model.evaluation.runner import build_prompt
    from model.training.trainer import TokenExample

    if (
        isinstance(max_length, bool)
        or not isinstance(max_length, int)
        or max_length < 2
    ):
        raise ValueError("max_length must be an integer of at least two tokens")
    if tokenizer.eos_token_id is None:
        raise ValueError("Tokenizer must provide an EOS token")
    samples = []
    for example in examples:
        prefix = tokenizer.apply_chat_template(
            [{"role": "user", "content": build_prompt(example.case)}],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        prompt_ids = tokenizer.encode(prefix, add_special_tokens=False)
        answer_ids = tokenizer.encode(example.target_text, add_special_tokens=False)
        if not prompt_ids or not answer_ids:
            raise ValueError(
                f"{example.case.id}: prompt and answer must contain tokens"
            )
        answer_ids = [*answer_ids, tokenizer.eos_token_id]
        ids = [*prompt_ids, *answer_ids]
        if len(ids) > max_length:
            raise ValueError(
                f"{example.case.id}: {len(ids)} tokens exceeds max_length={max_length}; no truncation performed"
            )
        samples.append(TokenExample(ids, [-100] * len(prompt_ids) + answer_ids))
    return samples


def _normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).split()).casefold()


def source_fingerprint(text: str) -> str:
    """Fingerprint text with the normalization used by existing manifests."""
    return hashlib.sha256(_normalize(text).encode("utf-8")).hexdigest()


def ensure_unseen(cases: list[EvaluationCase], used: list[dict[str, str]]) -> None:
    """Reject evaluation IDs or sources already used as a source or target."""
    used_ids = {_normalize(item["id"]) for item in used}
    used_texts = {
        digest
        for item in used
        for field in ("source_sha256", "target_sha256")
        if (digest := item.get(field))
    }
    for case in cases:
        if (
            _normalize(case.id) in used_ids
            or source_fingerprint(case.source_text) in used_texts
        ):
            raise ValueError(
                f"Evaluation case overlaps training or validation: {case.id}"
            )


def ensure_disjoint(training, validation, evaluation_cases) -> None:
    """Reject source or target reuse across partitions."""
    split_cases = {
        "training": [example.case for example in training],
        "validation": [example.case for example in validation],
        "evaluation": list(evaluation_cases),
    }
    for name, cases in split_cases.items():
        if not cases:
            raise ValueError(f"{name} must be nonempty")
    split_texts = {
        "training": {
            *(source_fingerprint(example.case.source_text) for example in training),
            *(source_fingerprint(example.target_text) for example in training),
        },
        "validation": {
            *(source_fingerprint(example.case.source_text) for example in validation),
            *(source_fingerprint(example.target_text) for example in validation),
        },
        "evaluation": {
            source_fingerprint(case.source_text) for case in evaluation_cases
        },
    }
    for (left_name, left), (right_name, right) in combinations(split_cases.items(), 2):
        if {_normalize(case.id) for case in left} & {
            _normalize(case.id) for case in right
        }:
            raise ValueError(f"{left_name}/{right_name} overlap in id")
        if split_texts[left_name] & split_texts[right_name]:
            raise ValueError(f"{left_name}/{right_name} overlap in source or target")
