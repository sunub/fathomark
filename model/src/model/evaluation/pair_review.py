import json
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from model.evaluation.assessment import ResponseAssessment
from model.evaluation.pair import BlindPair

PreferenceChoice = Literal["left", "right", "no_difference", "neither"]
Approach = Literal["prompt_baseline", "lora"]


@dataclass(frozen=True)
class PairPreference:
    """Internal record of a method-blind choice for one eligible response pair."""

    case_id: str
    left_approach: Approach
    right_approach: Approach
    choice: PreferenceChoice

    def __post_init__(self) -> None:
        if not isinstance(self.case_id, str):
            raise TypeError("case_id must be a string")
        if self.left_approach not in ("prompt_baseline", "lora"):
            raise TypeError("left_approach must be a supported approach")
        if self.right_approach not in ("prompt_baseline", "lora"):
            raise TypeError("right_approach must be a supported approach")
        if self.left_approach == self.right_approach:
            raise ValueError("preference sides must use different approaches")
        if self.choice not in ("left", "right", "no_difference", "neither"):
            raise ValueError("choice must be a supported preference option")

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> "PairPreference":
        case_id = data.get("case_id")
        left_approach = data.get("left_approach")
        right_approach = data.get("right_approach")
        choice = data.get("choice")

        if not isinstance(case_id, str):
            raise TypeError("case_id must be a string")
        if left_approach not in ("prompt_baseline", "lora"):
            raise TypeError("left_approach must be a supported approach")
        if right_approach not in ("prompt_baseline", "lora"):
            raise TypeError("right_approach must be a supported approach")
        if choice not in ("left", "right", "no_difference", "neither"):
            raise TypeError("choice must be a supported preference option")

        return cls(
            case_id=case_id,
            left_approach=left_approach,
            right_approach=right_approach,
            choice=choice,
        )


def can_collect_preference(
    left: ResponseAssessment,
    right: ResponseAssessment,
) -> bool:
    if left.case_id != right.case_id:
        raise ValueError("responses must belong to the same case")
    if left.approach == right.approach:
        raise ValueError("responses must use different approaches")

    return left.eligible_for_preference and right.eligible_for_preference


def record_preference(
    pair: BlindPair,
    left: ResponseAssessment,
    right: ResponseAssessment,
    choice: PreferenceChoice,
) -> PairPreference:
    if (
        left.case_id != pair.comparison.case_id
        or right.case_id != pair.comparison.case_id
    ):
        raise ValueError("assessments must belong to the blind pair's case")
    if left.approach != pair.left_approach or right.approach != pair.right_approach:
        raise ValueError("assessment methods must match the randomized side mapping")
    if not can_collect_preference(left, right):
        raise ValueError("both responses must pass all quality gates")

    return PairPreference(
        case_id=pair.comparison.case_id,
        left_approach=pair.left_approach,
        right_approach=pair.right_approach,
        choice=choice,
    )


def load_preferences(path: Path) -> Iterator[PairPreference]:
    with path.open(mode="r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue

            try:
                data = json.loads(line)
                if not isinstance(data, dict):
                    raise TypeError("each line must contain a JSON object")

                yield PairPreference.from_dict(data)
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                raise ValueError(
                    f"{path}:{line_number}: invalid pair preference: {error}"
                ) from error


def save_preferences(
    preferences: Iterable[PairPreference],
    path: Path,
) -> None:
    with path.open("w", encoding="utf-8") as file:
        for preference in preferences:
            file.write(json.dumps(asdict(preference), ensure_ascii=False) + "\n")
