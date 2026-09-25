import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from model.evaluation.case import EvaluationCase, load_cases


class EvaluationCaseTest(unittest.TestCase):
    def test_from_dict_converts_expected_facts_to_tuple(self) -> None:
        case = EvaluationCase.from_dict(
            {
                "id": "ko-style-001",
                "request": "짧게 정리해 줘.",
                "source_text": "검색 기능을 개발 중이다.",
                "style": "짧고 차분하게 쓴다.",
                "expected_facts": ["검색 기능을 개발 중이다"],
            }
        )

        self.assertEqual(case.id, "ko-style-001")
        self.assertEqual(case.expected_facts, ("검색 기능을 개발 중이다",))

    def test_from_dict_rejects_missing_style(self) -> None:
        with self.assertRaisesRegex(TypeError, "style must be a string"):
            EvaluationCase.from_dict(
                {
                    "id": "ko-style-001",
                    "request": "짧게 정리해 줘.",
                    "source_text": "검색 기능을 개발 중이다.",
                    "expected_facts": [],
                }
            )

    def test_from_dict_rejects_invalid_string_fields_with_type_error(self) -> None:
        valid_data: dict[str, object] = {
            "id": "ko-style-001",
            "request": "짧게 정리해 줘.",
            "source_text": "검색 기능을 개발 중이다.",
            "style": "짧고 차분하게 쓴다.",
            "expected_facts": [],
        }

        for field in ("id", "request", "source_text", "style"):
            with self.subTest(field=field):
                invalid_data = {**valid_data, field: 42}
                with self.assertRaisesRegex(TypeError, f"{field} must be a string"):
                    EvaluationCase.from_dict(invalid_data)

    def test_load_cases_adds_path_and_line_to_invalid_field_error(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "cases.jsonl"
            path.write_text(
                '{"id": 42, "request": "요청", "source_text": "근거", '
                '"style": "문체", "expected_facts": []}\n',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                ValueError,
                r"cases\.jsonl:1: invalid Evaluation case: id must be a string",
            ):
                list(load_cases(path))
