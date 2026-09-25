import json
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EvaluationCase:
    id: str
    request: str
    source_text: str
    style: str
    expected_facts: tuple[str, ...]

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> "EvaluationCase":
        expected_facts = data.get("expected_facts")

        if not isinstance(expected_facts, list) or not all(
            isinstance(fact, str) for fact in expected_facts
        ):
            raise ValueError("expected_facts must be a list of strings")

        id_value = data.get("id")
        request = data.get("request")
        source_text = data.get("source_text")
        style = data.get("style")

        if not isinstance(id_value, str):
            raise TypeError("id must be a string")
        if not isinstance(request, str):
            raise TypeError("request must be a string")
        if not isinstance(source_text, str):
            raise TypeError("source_text must be a string")
        if not isinstance(style, str):
            raise TypeError("style must be a string")

        return cls(
            id=id_value,
            request=request,
            source_text=source_text,
            style=style,
            expected_facts=tuple(expected_facts),
        )


def load_cases(path: Path) -> Iterator[EvaluationCase]:
    with path.open(mode="r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue

            try:
                data = json.loads(line)
                if not isinstance(data, dict):
                    raise TypeError("each line must contain a JSON object")

                yield EvaluationCase.from_dict(data)
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                raise ValueError(
                    f"{path}:{line_number}: invalid Evaluation case: {error}"
                ) from error
