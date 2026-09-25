import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from model.evaluation.assessment import ResponseAssessment
from model.evaluation.pair import make_result_pairs, randomize_pair
from model.evaluation.pair_review import (
    PairPreference,
    can_collect_preference,
    load_preferences,
    record_preference,
    save_preferences,
)
from model.evaluation.result import EvaluationResult, group_results


class PairPreferenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.left = ResponseAssessment(
            case_id="ko-style-001",
            approach="prompt_baseline",
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=True,
        )
        self.right = ResponseAssessment(
            case_id="ko-style-001",
            approach="lora",
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=True,
        )

    def test_both_eligible_responses_allow_preference(self) -> None:
        self.assertTrue(can_collect_preference(self.left, self.right))

    def test_failed_response_blocks_preference(self) -> None:
        unsafe_right = ResponseAssessment(
            case_id="ko-style-001",
            approach="lora",
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=False,
        )

        self.assertFalse(can_collect_preference(self.left, unsafe_right))

    def test_different_cases_cannot_be_compared(self) -> None:
        different_case = ResponseAssessment(
            case_id="ko-style-002",
            approach="lora",
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=True,
        )

        with self.assertRaisesRegex(ValueError, "must belong to the same case"):
            can_collect_preference(self.left, different_case)

    def test_same_approach_cannot_be_compared(self) -> None:
        duplicate_approach = ResponseAssessment(
            case_id="ko-style-001",
            approach="prompt_baseline",
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=True,
        )

        with self.assertRaisesRegex(ValueError, "must use different approaches"):
            can_collect_preference(self.left, duplicate_approach)

    def test_preference_records_blind_side_choice_and_internal_mapping(self) -> None:
        preference = PairPreference(
            case_id="ko-style-001",
            left_approach="lora",
            right_approach="prompt_baseline",
            choice="left",
        )

        self.assertEqual(preference.choice, "left")
        self.assertEqual(preference.left_approach, "lora")
        self.assertEqual(preference.right_approach, "prompt_baseline")

    def test_preference_rejects_unsupported_choice(self) -> None:
        with self.assertRaisesRegex(ValueError, "supported preference option"):
            PairPreference(
                case_id="ko-style-001",
                left_approach="lora",
                right_approach="prompt_baseline",
                choice="baseline",  # type: ignore[arg-type]
            )

    def test_record_preference_uses_blind_side_mapping_after_gates(self) -> None:
        results = [
            EvaluationResult(
                case_id="ko-style-001",
                approach="prompt_baseline",
                generated_text="기준 답변",
                base_model="local-test-model",
                generation_settings={"temperature": 0.2},
            ),
            EvaluationResult(
                case_id="ko-style-001",
                approach="lora",
                generated_text="개인화 답변",
                base_model="local-test-model",
                generation_settings={"temperature": 0.2},
            ),
        ]
        blind_pair = randomize_pair(next(make_result_pairs(group_results(results))))
        left_assessment = ResponseAssessment(
            case_id="ko-style-001",
            approach=blind_pair.left_approach,
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=True,
        )
        right_assessment = ResponseAssessment(
            case_id="ko-style-001",
            approach=blind_pair.right_approach,
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=True,
        )

        preference = record_preference(
            blind_pair,
            left_assessment,
            right_assessment,
            "left",
        )

        self.assertEqual(preference.choice, "left")
        self.assertEqual(preference.left_approach, blind_pair.left_approach)
        self.assertEqual(preference.right_approach, blind_pair.right_approach)

    def test_ineligible_pair_cannot_record_preference(self) -> None:
        from model.evaluation.pair import BlindComparison, BlindPair

        blind_pair = BlindPair(
            comparison=BlindComparison(
                case_id="ko-style-001",
                left_text="기준 답변",
                right_text="개인화 답변",
            ),
            left_approach="prompt_baseline",
            right_approach="lora",
        )
        unsafe = ResponseAssessment(
            case_id="ko-style-001",
            approach="lora",
            grounding_passed=True,
            facts_preserved=True,
            conflicts_handled=True,
            safety_passed=False,
        )

        with self.assertRaisesRegex(ValueError, "both responses must pass"):
            record_preference(blind_pair, self.left, unsafe, "left")

    def test_preference_jsonl_round_trip(self) -> None:
        preference = PairPreference(
            case_id="ko-style-001",
            left_approach="lora",
            right_approach="prompt_baseline",
            choice="neither",
        )

        with TemporaryDirectory() as directory:
            path = Path(directory) / "preferences.jsonl"
            save_preferences([preference], path)

            self.assertEqual(list(load_preferences(path)), [preference])


if __name__ == "__main__":
    unittest.main()
