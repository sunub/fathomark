import json
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

GenerationSettings = dict[str, str | int | float | bool | None]


@dataclass(frozen=True)
class EvaluationResult:
    case_id: str
    approach: Literal["prompt_baseline", "lora"]
    generated_text: str
    base_model: str
    generation_settings: GenerationSettings

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> "EvaluationResult":
        case_id = data.get("case_id")
        approach = data.get("approach")
        generated_text = data.get("generated_text")
        base_model = data.get("base_model")
        generation_settings = data.get("generation_settings")

        if not isinstance(case_id, str):
            raise TypeError("case_id must be a string")
        if approach not in ("prompt_baseline", "lora"):
            raise TypeError("approach must be a 'prompt_baseline' or 'lora'")
        if not isinstance(generated_text, str):
            raise TypeError("generated_text must be a string")
        if not isinstance(base_model, str):
            raise TypeError("base_model must be a string")
        if not isinstance(generation_settings, dict):
            raise TypeError("generation_settings must be an object")
        if not all(
            isinstance(key, str)
            and (value is None or isinstance(value, str | int | float | bool))
            for key, value in generation_settings.items()
        ):
            raise TypeError("generation_settings must contain JSON scalar values")

        return cls(
            case_id=case_id,
            approach=approach,
            generated_text=generated_text,
            base_model=base_model,
            generation_settings=generation_settings,
        )


def load_results(path: Path) -> Iterator[EvaluationResult]:
    with path.open(mode="r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue

            try:
                data = json.loads(line)
                if not isinstance(data, dict):
                    raise TypeError("each line must contain a JSON object")

                yield EvaluationResult.from_dict(data)
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                raise ValueError(
                    f"{path}:{line_number}: invalid evaluation result: {error}"
                ) from error


def save_results(results: Iterable[EvaluationResult], path: Path) -> None:
    with path.open("w", encoding="utf-8") as file:
        for result in results:
            file.write(json.dumps(asdict(result), ensure_ascii=False) + "\n")


def group_results(
    results: Iterable[EvaluationResult],
) -> dict[str, dict[str, EvaluationResult]]:
    grouped: dict[str, dict[str, EvaluationResult]] = {}

    for result in results:
        approaches = grouped.setdefault(result.case_id, {})

        if result.approach in approaches:
            raise ValueError(
                f"duplicate result for case {result.case_id!r} "
                f"and approach {result.approach!r}"
            )

        approaches[result.approach] = result

    return grouped
