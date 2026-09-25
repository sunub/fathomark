from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from random import Random, SystemRandom
from typing import Literal

from model.evaluation.result import EvaluationResult

Approach = Literal["prompt_baseline", "lora"]


@dataclass(frozen=True)
class ResultPair:
    """Baseline and LoRA outputs produced under the same evaluation settings."""

    case_id: str
    baseline: EvaluationResult
    lora: EvaluationResult

    def __post_init__(self) -> None:
        if self.baseline.case_id != self.case_id or self.lora.case_id != self.case_id:
            raise ValueError("paired results must belong to the declared case")
        if self.baseline.approach != "prompt_baseline":
            raise ValueError("baseline result must use prompt_baseline")
        if self.lora.approach != "lora":
            raise ValueError("candidate result must use lora")
        if self.baseline.base_model != self.lora.base_model:
            raise ValueError("paired results must use the same base model")
        if self.baseline.generation_settings != self.lora.generation_settings:
            raise ValueError("paired results must use the same generation settings")


@dataclass(frozen=True)
class BlindComparison:
    """The fields suitable for showing to a reviewer; it contains no method labels."""

    case_id: str
    left_text: str
    right_text: str


@dataclass(frozen=True)
class BlindPair:
    """A randomized pair with internal method mapping for later analysis."""

    comparison: BlindComparison
    left_approach: Approach
    right_approach: Approach

    def for_user(self) -> BlindComparison:
        return self.comparison


def make_result_pairs(
    grouped: Mapping[str, Mapping[str, EvaluationResult]],
) -> Iterator[ResultPair]:
    for case_id, approaches in grouped.items():
        baseline = approaches.get("prompt_baseline")
        lora = approaches.get("lora")

        if baseline is None or lora is None:
            continue

        yield ResultPair(case_id=case_id, baseline=baseline, lora=lora)


def randomize_pair(
    pair: ResultPair,
    rng: Random | SystemRandom | None = None,
) -> BlindPair:
    responses = [pair.baseline, pair.lora]
    (rng or SystemRandom()).shuffle(responses)
    left, right = responses

    return BlindPair(
        comparison=BlindComparison(
            case_id=pair.case_id,
            left_text=left.generated_text,
            right_text=right.generated_text,
        ),
        left_approach=left.approach,
        right_approach=right.approach,
    )
