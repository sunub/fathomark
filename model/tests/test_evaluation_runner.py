import json
import unittest
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from model.evaluation.case import EvaluationCase
from model.evaluation.result import EvaluationResult
from model.evaluation.runner import (
    _fingerprint,
    build_prompt,
    finalize_review,
    generate_results,
    write_evaluation,
)


class EvaluationRunnerTest(unittest.TestCase):
    def setUp(self):
        self.case = EvaluationCase(
            "case-1", "안내문", "회의는 301호.", "짧게 써요.", ("301호",)
        )
        self.results = [
            EvaluationResult(
                "case-1", approach, "301호에서 만나요.", "tiny", {"seed": 42}
            )
            for approach in ("prompt_baseline", "lora")
        ]

    def review_file(self, root, mutate=None):
        rows = [
            json.loads(line)
            for line in (root / "reviews.template.jsonl").read_text().splitlines()
        ]
        for row in rows:
            for field in (
                "grounding_passed",
                "facts_preserved",
                "conflicts_handled",
                "safety_passed",
            ):
                row[field] = True
        if mutate:
            mutate(rows)
        path = root / "reviews.jsonl"
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        return path

    def test_prompt_excludes_held_out_facts_and_methods_receive_identical_input(self):
        case = replace(self.case, expected_facts=("SECRET_EXPECTATION",))
        self.assertNotIn("SECRET_EXPECTATION", build_prompt(case))
        prompts = []
        for approach in ("prompt_baseline", "lora"):
            generate_results(
                [case],
                lambda prompt: prompts.append(prompt) or "answer",
                approach,
                "tiny",
                {},
            )
        self.assertEqual(prompts[0], prompts[1])
        self.assertIn(self.case.source_text, prompts[0])

    def test_invalid_cases_fail_before_generation(self):
        for cases in (
            [],
            [self.case, self.case],
            [replace(self.case, request=" ")],
            [replace(self.case, expected_facts=())],
        ):
            with self.subTest(cases=cases), self.assertRaises(ValueError):
                generate_results(
                    cases,
                    lambda _: self.fail("generated before validation"),
                    "lora",
                    "tiny",
                    {},
                )

    def test_matching_literals_never_automatically_pass(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            report = write_evaluation(root, [self.case], self.results)
            self.assertEqual(report["status"], "pending_review")
            template = root / "reviews.template.jsonl"
            with self.assertRaises((ValueError, TypeError)):
                finalize_review(root, template)

    def test_v2_paraphrase_waits_for_human_review(self):
        case = replace(
            self.case,
            schema_version=2,
            expected_facts=("회의는 금요일에 열린다.",),
            literal_facts=("금요일",),
        )
        passing = [
            replace(result, generated_text="금요일에 회의를 엽니다.")
            for result in self.results
        ]
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            report = write_evaluation(root, [case], passing)
            self.assertEqual(report["status"], "pending_review")
            self.assertEqual(
                finalize_review(root, self.review_file(root))["status"],
                "quality_passed_pending_style_choice",
            )
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            missing = [passing[0], replace(passing[1], generated_text="회의를 엽니다.")]
            write_evaluation(root, [case], missing)
            self.assertEqual(
                finalize_review(root, self.review_file(root))["status"], "rejected"
            )

    def test_v1_fingerprint_remains_compatible(self):
        self.assertEqual(
            _fingerprint(self.case, self.results[1]),
            "bc211358e118c744dc43910e9436aaeeb1fb2e3dc90ab2a10081eec1e122eb5c",
        )

    def test_review_success_creates_method_blind_comparison_only(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_evaluation(root, [self.case], self.results)
            report = finalize_review(root, self.review_file(root))
            self.assertEqual(report["status"], "quality_passed_pending_style_choice")
            comparisons = json.loads((root / "blind-comparisons.json").read_text())
            self.assertEqual(len(comparisons), 1)
            self.assertEqual(
                set(comparisons[0]), {"case_id", "left_text", "right_text"}
            )

    def test_false_review_and_literal_missing_veto(self):
        for missing in (False, True):
            with self.subTest(missing=missing), TemporaryDirectory() as tmp:
                root = Path(tmp) / "run"
                results = (
                    self.results
                    if not missing
                    else [
                        self.results[0],
                        replace(self.results[1], generated_text="다른 곳"),
                    ]
                )
                write_evaluation(root, [self.case], results)
                mutate = (
                    None
                    if missing
                    else lambda rows: rows[1].update(safety_passed=False)
                )
                report = finalize_review(root, self.review_file(root, mutate))
                self.assertEqual(report["status"], "rejected")
                self.assertEqual(
                    json.loads((root / "blind-comparisons.json").read_text()), []
                )

    def test_stale_reviews_rejected_for_answer_case_and_settings(self):
        for filename, field, value in (
            ("results.jsonl", "generated_text", "301호 새 답변"),
            ("results.jsonl", "generation_settings", {"seed": 1}),
            ("cases.jsonl", "source_text", "근거가 바뀜"),
        ):
            with self.subTest(field=field), TemporaryDirectory() as tmp:
                root = Path(tmp) / "run"
                write_evaluation(root, [self.case], self.results)
                review = self.review_file(root)
                path = root / filename
                rows = [json.loads(line) for line in path.read_text().splitlines()]
                for row in rows:
                    row[field] = value
                path.write_text("".join(json.dumps(row) + "\n" for row in rows))
                with self.assertRaises(ValueError):
                    finalize_review(root, review)

    def test_review_coverage_must_be_complete_unique_known(self):
        for mutate in (
            lambda rows: rows.pop(),
            lambda rows: rows.append(rows[0]),
            lambda rows: rows[0].update(case_id="unknown"),
        ):
            with TemporaryDirectory() as tmp:
                root = Path(tmp) / "run"
                write_evaluation(root, [self.case], self.results)
                with self.assertRaises(ValueError):
                    finalize_review(root, self.review_file(root, mutate))

    def test_incomplete_or_incomparable_runs_are_not_written(self):
        for results in (
            self.results[:1],
            self.results + self.results[:1],
            [self.results[0], replace(self.results[1], base_model="other")],
        ):
            with TemporaryDirectory() as tmp:
                root = Path(tmp) / "run"
                with self.assertRaises(ValueError):
                    write_evaluation(root, [self.case], results)
                self.assertFalse(root.exists())

    def test_unsupported_claim_blocks_lora_even_if_all_booleans_pass(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_evaluation(root, [self.case], self.results)
            review = self.review_file(
                root, lambda rows: rows[1].update(unsupported_claims=["made up"])
            )
            self.assertEqual(finalize_review(root, review)["status"], "rejected")

    def test_failed_baseline_blocks_comparison_even_if_lora_passes(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_evaluation(root, [self.case], self.results)
            review = self.review_file(
                root, lambda rows: rows[0].update(grounding_passed=False)
            )
            report = finalize_review(root, review)
            self.assertEqual(report["status"], "quality_passed_pending_style_choice")
            self.assertEqual(report["eligible_comparison_count"], 0)

    def test_existing_output_is_never_overwritten(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_evaluation(root, [self.case], self.results)
            before = (root / "results.jsonl").read_bytes()
            with self.assertRaises(FileExistsError):
                write_evaluation(root, [self.case], self.results)
            self.assertEqual((root / "results.jsonl").read_bytes(), before)

    def test_finalize_is_idempotent_and_preserves_blinded_order(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_evaluation(root, [self.case], self.results)
            review = self.review_file(root)
            first = finalize_review(root, review)
            names = (
                "final-report.json",
                "blind-comparisons.json",
                "blind-mapping.json",
            )
            snapshots = {
                name: ((root / name).read_bytes(), (root / name).stat().st_mtime_ns)
                for name in names
            }
            with patch(
                "model.evaluation.runner.randomize_pair",
                side_effect=AssertionError("must not rerandomize"),
            ):
                self.assertEqual(finalize_review(root, review), first)
            self.assertEqual(
                snapshots,
                {
                    name: ((root / name).read_bytes(), (root / name).stat().st_mtime_ns)
                    for name in names
                },
            )

    def test_changed_finalized_inputs_or_mapping_invalidate_derived_files(self):
        for filename in (
            "results.jsonl",
            "cases.jsonl",
            "reviews.jsonl",
            "blind-mapping.json",
        ):
            with self.subTest(filename=filename), TemporaryDirectory() as tmp:
                root = Path(tmp) / "run"
                write_evaluation(root, [self.case], self.results)
                review = self.review_file(root)
                finalize_review(root, review)
                path = root / filename
                path.write_text(path.read_text() + " ")
                with self.assertRaisesRegex(ValueError, "new evaluation run"):
                    finalize_review(root, review)
                for name in (
                    "final-report.json",
                    "blind-comparisons.json",
                    "blind-mapping.json",
                ):
                    self.assertFalse((root / name).exists())
                self.assertTrue(review.exists())
                self.assertTrue((root / "cases.jsonl").exists())
                self.assertTrue((root / "results.jsonl").exists())
                with self.assertRaisesRegex(ValueError, "new evaluation run"):
                    finalize_review(root, review)

    def test_unreadable_finalized_input_invalidates_derived_files(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_evaluation(root, [self.case], self.results)
            review = self.review_file(root)
            finalize_review(root, review)
            review.unlink()
            with self.assertRaises(FileNotFoundError):
                finalize_review(root, review)
            for name in (
                "final-report.json",
                "blind-comparisons.json",
                "blind-mapping.json",
            ):
                self.assertFalse((root / name).exists())

    def test_partial_outputs_are_removed_before_failed_review(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "run"
            write_evaluation(root, [self.case], self.results)
            for name in ("blind-comparisons.json", "blind-mapping.json"):
                (root / name).write_text("stale")
            with self.assertRaises(TypeError):
                finalize_review(root, root / "reviews.template.jsonl")
            self.assertFalse((root / "blind-comparisons.json").exists())
            self.assertFalse((root / "blind-mapping.json").exists())
