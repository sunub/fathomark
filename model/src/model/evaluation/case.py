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
    schema_version: int = 1
    literal_facts: tuple[str, ...] | None = None

    def required_literals(self) -> tuple[str, ...]:
        self._validate_schema()
        return (
            self.expected_facts
            if self.schema_version == 1
            else self.literal_facts or ()
        )

    def to_dict(self) -> dict[str, object]:
        self._validate_schema()
        result: dict[str, object] = {
            "id": self.id,
            "request": self.request,
            "source_text": self.source_text,
            "style": self.style,
            "expected_facts": list(self.expected_facts),
        }
        if self.schema_version == 2:
            result.update(
                schema_version=2,
                literal_facts=list(self.literal_facts or ()),
            )
        return result

    def _validate_schema(self) -> None:
        if (
            isinstance(self.schema_version, bool)
            or not isinstance(self.schema_version, int)
            or self.schema_version not in (1, 2)
        ):
            raise ValueError("schema_version must be integer 1 or 2")
        if self.schema_version == 1 and self.literal_facts is not None:
            raise ValueError("v1 cases must not define literal_facts")
        if self.schema_version == 2 and self.literal_facts is None:
            raise ValueError("v2 cases must explicitly define literal_facts")
        if self.literal_facts is not None and any(
            not isinstance(fact, str) or not fact.strip() for fact in self.literal_facts
        ):
            raise ValueError("literal_facts must contain nonblank strings")

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
        schema_version = data.get("schema_version", 1)
        has_literal_facts = "literal_facts" in data
        literal_facts = data.get("literal_facts")

        if not isinstance(id_value, str):
            raise TypeError("id must be a string")
        if not isinstance(request, str):
            raise TypeError("request must be a string")
        if not isinstance(source_text, str):
            raise TypeError("source_text must be a string")
        if not isinstance(style, str):
            raise TypeError("style must be a string")
        if (
            isinstance(schema_version, bool)
            or not isinstance(schema_version, int)
            or schema_version not in (1, 2)
        ):
            raise ValueError("schema_version must be integer 1 or 2")
        if schema_version == 1 and has_literal_facts:
            raise ValueError("v1 cases must not define literal_facts")
        if schema_version == 2 and not has_literal_facts:
            raise ValueError("v2 cases must explicitly define literal_facts")
        if has_literal_facts and (
            not isinstance(literal_facts, list)
            or not all(isinstance(fact, str) for fact in literal_facts)
        ):
            raise ValueError("literal_facts must be a list of strings")

        case = cls(
            id=id_value,
            request=request,
            source_text=source_text,
            style=style,
            expected_facts=tuple(expected_facts),
            schema_version=schema_version,
            literal_facts=tuple(literal_facts)
            if isinstance(literal_facts, list)
            else None,
        )
        case._validate_schema()
        return case


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
