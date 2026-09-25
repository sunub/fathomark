import unittest
from random import Random

from model.evaluation.pair import make_result_pairs, randomize_pair
from model.evaluation.result import EvaluationResult, group_results


class BlindPairTest(unittest.TestCase):
    def setUp(self) -> None:
        self.baseline = EvaluationResult(
            case_id="ko-style-001",
            approach="prompt_baseline",
            generated_text="기준 답변",
            base_model="local-test-model",
            generation_settings={"temperature": 0.2, "max_new_tokens": 64},
        )
        self.lora = EvaluationResult(
            case_id="ko-style-001",
            approach="lora",
            generated_text="개인화 답변",
            base_model="local-test-model",
            generation_settings={"temperature": 0.2, "max_new_tokens": 64},
        )
        self.pair = next(make_result_pairs(group_results([self.baseline, self.lora])))

    def test_result_pair_rejects_different_base_models(self) -> None:
        different_model = EvaluationResult(
            case_id="ko-style-001",
            approach="lora",
            generated_text="개인화 답변",
            base_model="other-model",
            generation_settings={"temperature": 0.2, "max_new_tokens": 64},
        )

        with self.assertRaisesRegex(ValueError, "same base model"):
            list(make_result_pairs(group_results([self.baseline, different_model])))

    def test_result_pair_rejects_different_generation_settings(self) -> None:
        different_settings = EvaluationResult(
            case_id="ko-style-001",
            approach="lora",
            generated_text="개인화 답변",
            base_model="local-test-model",
            generation_settings={"temperature": 0.7, "max_new_tokens": 64},
        )

        with self.assertRaisesRegex(ValueError, "same generation settings"):
            list(make_result_pairs(group_results([self.baseline, different_settings])))

    def test_randomized_pair_exposes_method_free_view_and_keeps_mapping(self) -> None:
        first = randomize_pair(self.pair, Random(0))
        second = randomize_pair(self.pair, Random(1))

        self.assertNotEqual(first.left_approach, second.left_approach)
        view = first.for_user()
        self.assertCountEqual(
            (view.left_text, view.right_text),
            (self.baseline.generated_text, self.lora.generated_text),
        )
        self.assertFalse(hasattr(view, "left_approach"))
        self.assertFalse(hasattr(view, "right_approach"))


if __name__ == "__main__":
    unittest.main()
