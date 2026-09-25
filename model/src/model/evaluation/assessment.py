import json
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal


@dataclass(frozen=True)
class ResponseAssessment:
    """Quality checks for one response, separate from style preference."""

    case_id: str
    approach: Literal["prompt_baseline", "lora"]
    grounding_passed: bool
    facts_preserved: bool
    conflicts_handled: bool
    safety_passed: bool
    unsupported_claims: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> "ResponseAssessment":
        case_id = data.get("case_id")
        approach = data.get("approach")
        boolean_fields = (
            "grounding_passed",
            "facts_preserved",
            "conflicts_handled",
            "safety_passed",
        )

        if not isinstance(case_id, str):
            raise TypeError("case_id must be a string")
        if approach not in ("prompt_baseline", "lora"):
            raise TypeError("approach must be a 'prompt_baseline' or 'lora'")

        checks: dict[str, bool] = {}
        for field_name in boolean_fields:
            value = data.get(field_name)
            if not isinstance(value, bool):
                raise TypeError(f"{field_name} must be a boolean")
            checks[field_name] = value

        unsupported_claims = data.get("unsupported_claims", [])
        if not isinstance(unsupported_claims, list) or not all(
            isinstance(claim, str) for claim in unsupported_claims
        ):
            raise TypeError("unsupported_claims must be a list of strings")

        return cls(
            case_id=case_id,
            approach=approach,
            **checks,
            unsupported_claims=tuple(unsupported_claims),
        )

    @property
    def eligible_for_preference(self) -> bool:
        return (
            self.grounding_passed
            and not self.unsupported_claims
            and self.facts_preserved
            and self.conflicts_handled
            and self.safety_passed
        )


def load_assessments(path: Path) -> Iterator[ResponseAssessment]:
    with path.open(mode="r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue

            try:
                data = json.loads(line)
                if not isinstance(data, dict):
                    raise TypeError("each line must contain a JSON object")

                yield ResponseAssessment.from_dict(data)
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                raise ValueError(
                    f"{path}:{line_number}: invalid response assessment: {error}"
                ) from error


def save_assessments(
    assessments: Iterable[ResponseAssessment],
    path: Path,
) -> None:
    with path.open("w", encoding="utf-8") as file:
        for assessment in assessments:
            file.write(json.dumps(asdict(assessment), ensure_ascii=False) + "\n")
