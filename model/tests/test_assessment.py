import unittest
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory

from model.evaluation.assessment import (
    ResponseAssessment,
    load_assessments,
    save_assessments,
)


class ResponseAssessmentTest(unittest.TestCase):
    def setUp(self) -> None:
        self.assessment = ResponseAssessment(
            case_id="ko-style-001",
            approach="prompt_baseline",
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=True,
        )

    def test_all_quality_gates_allow_preference(self) -> None:
        self.assertTrue(self.assessment.eligible_for_preference)
        self.assertEqual(self.assessment.unsupported_claims, ())

    def test_any_failed_quality_gate_blocks_preference(self) -> None:
        for gate in (
            "grounding_passed",
            "facts_preserved",
            "conflicts_handled",
            "safety_passed",
        ):
            with self.subTest(gate=gate):
                failed_assessment = replace(self.assessment, **{gate: False})
                self.assertFalse(failed_assessment.eligible_for_preference)

    def test_unsupported_claims_block_preference(self) -> None:
        assessment = replace(
            self.assessment,
            unsupported_claims=("원문에 없는 주장",),
        )

        self.assertFalse(assessment.eligible_for_preference)

    def test_assessment_jsonl_round_trip(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "assessments.jsonl"
            save_assessments([self.assessment], path)

            self.assertEqual(list(load_assessments(path)), [self.assessment])


if __name__ == "__main__":
    unittest.main()
