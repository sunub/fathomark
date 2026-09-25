import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from model.evaluation.result import (
    EvaluationResult,
    group_results,
    load_results,
    save_results,
)


class EvaluationResultTest(unittest.TestCase):
    def test_jsonl_round_trip_preserves_generation_context(self) -> None:
        result = EvaluationResult(
            case_id="ko-style-001",
            approach="prompt_baseline",
            generated_text="짧은 답변입니다.",
            base_model="local-test-model",
            generation_settings={"temperature": 0.2, "max_new_tokens": 64},
        )

        with TemporaryDirectory() as directory:
            path = Path(directory) / "results.jsonl"
            save_results([result], path)

            self.assertEqual(list(load_results(path)), [result])

    def test_load_results_adds_path_and_line_to_invalid_metadata(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "results.jsonl"
            path.write_text(
                '{"case_id":"ko-style-001","approach":"lora",'
                '"generated_text":"답변","base_model":"test",'
                '"generation_settings":[]}\n',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(
                ValueError,
                r"results\.jsonl:1: invalid evaluation result: generation_settings must be an object",
            ):
                list(load_results(path))

    def test_group_results_rejects_duplicate_approach(self) -> None:
        result = EvaluationResult(
            case_id="ko-style-001",
            approach="lora",
            generated_text="답변",
            base_model="local-test-model",
            generation_settings={"temperature": 0.2},
        )

        with self.assertRaisesRegex(ValueError, "duplicate result"):
            group_results([result, result])


if __name__ == "__main__":
    unittest.main()
