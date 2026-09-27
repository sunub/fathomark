import copy
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from model.evaluation.case import EvaluationCase
from model.training.supervised import (
    SupervisedExample,
    build_supervised_samples,
    ensure_disjoint,
    load_supervised,
    prepare_target_reviews,
    target_fingerprint,
)


def row():
    data = {
        "id": "train",
        "request": "안내해 줘",
        "source_text": "회의는 2시다.",
        "style": "짧게 쓴다.",
        "expected_facts": ["2시"],
        "target_text": "회의는 2시야.",
        "target_review": {
            "grounding_passed": True,
            "facts_preserved": True,
            "conflicts_handled": True,
            "safety_passed": True,
            "unsupported_claims": [],
        },
    }
    data["target_review"]["target_sha256"] = target_fingerprint(
        EvaluationCase.from_dict(data), data["target_text"]
    )
    return data


class SupervisedTest(unittest.TestCase):
    def load_rows(self, rows):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "examples.jsonl"
            path.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
            return load_supervised(path)

    def test_loads_reviewed_targets(self):
        examples = self.load_rows([row()])
        self.assertEqual(examples[0].case.expected_facts, ("2시",))
        self.assertEqual(examples[0].target_text, "회의는 2시야.")

    def test_rejects_missing_hash_or_target_and_case_edits_after_review(self):
        original = row()
        missing_hash = copy.deepcopy(original)
        del missing_hash["target_review"]["target_sha256"]
        for data in (
            missing_hash,
            {**original, "target_text": "회의는 2시야. 비용은 500원이야."},
            {**original, "source_text": "회의는 2시가 아니다."},
            {**original, "request": "시간을 바꿔 줘"},
            {**original, "style": "다른 문체"},
            {**original, "expected_facts": ["회의"]},
        ):
            with (
                self.subTest(data=data),
                self.assertRaisesRegex(ValueError, "target_sha256"),
            ):
                self.load_rows([data])

    def test_prepares_unapproved_bound_reviews_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.jsonl"
            output = Path(directory) / "review.jsonl"
            source.write_text(json.dumps(row()), encoding="utf-8")
            self.assertEqual(prepare_target_reviews(source, output), 1)
            prepared = json.loads(output.read_text())
            review = prepared["target_review"]
            fields = (
                "grounding_passed",
                "facts_preserved",
                "conflicts_handled",
                "safety_passed",
            )
            for field in fields:
                self.assertIsNone(review[field])
            self.assertEqual(review["unsupported_claims"], [])
            with self.assertRaises(ValueError):
                load_supervised(output)
            before = output.read_bytes()
            with self.assertRaises(FileExistsError):
                prepare_target_reviews(source, output)
            self.assertEqual(output.read_bytes(), before)
            for field in fields:
                review[field] = True
            output.write_text(json.dumps(prepared), encoding="utf-8")
            self.assertEqual(
                load_supervised(output)[0].target_text, row()["target_text"]
            )

    def test_rejects_missing_failed_or_mismatched_reviews_and_missing_facts(self):
        mutations = [
            {"target_review": None},
            {"target_text": "회의는 내일이야."},
            {"target_text": " "},
            {"expected_facts": []},
            {"expected_facts": [" "]},
            {"source_text": " "},
            {"id": " "},
            {"request": " "},
            {"style": " "},
        ]
        for field in (
            "grounding_passed",
            "facts_preserved",
            "conflicts_handled",
            "safety_passed",
        ):
            review = copy.deepcopy(row()["target_review"])
            review[field] = False
            mutations.append({"target_review": review})
        for field, value in (
            ("unsupported_claims", ["추가 주장"]),
            ("case_id", "other"),
            ("facts_preserved", 1),
        ):
            review = copy.deepcopy(row()["target_review"])
            review[field] = value
            mutations.append({"target_review": review})
        for mutation in mutations:
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.load_rows([{**row(), **mutation}])
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.load_rows([row(), row()])
        with self.assertRaises(ValueError):
            self.load_rows([])

    def test_masks_prompt_and_preserves_complete_answer_with_eos(self):
        class Tokenizer:
            eos_token_id = 99

            def apply_chat_template(
                self, messages, *, tokenize, add_generation_prompt, enable_thinking
            ):
                assert messages[0]["role"] == "user"
                assert "2시" in messages[0]["content"]
                assert not tokenize and add_generation_prompt and not enable_thinking
                return "formatted prompt"

            def encode(self, text, *, add_special_tokens):
                assert not add_special_tokens
                return [1, 2, 3] if text == "formatted prompt" else [4, 5]

        examples = self.load_rows([row()])
        sample = build_supervised_samples(examples, Tokenizer(), max_length=6)[0]
        self.assertEqual(sample.input_ids, [1, 2, 3, 4, 5, 99])
        self.assertEqual(sample.labels, [-100, -100, -100, 4, 5, 99])
        with self.assertRaisesRegex(ValueError, "max_length"):
            build_supervised_samples(examples, Tokenizer(), max_length=5)

    def test_split_overlap_rejects_ids_sources_and_answers_but_allows_style(self):
        train = self.load_rows([row()])[0]
        validation = SupervisedExample(
            replace(
                train.case,
                id="validation",
                source_text="장소는 서울.",
                expected_facts=("서울",),
            ),
            "서울에서 만나요.",
        )
        evaluation = EvaluationCase(
            "test", "알려 줘", "마감은 금요일.", train.case.style, ("금요일",)
        )
        ensure_disjoint([train], [validation], [evaluation])
        for invalid in (
            replace(validation, case=replace(validation.case, id=train.case.id)),
            replace(
                validation,
                case=replace(validation.case, source_text="  회의는   2시다.\n"),
            ),
            replace(validation, target_text="  회의는   2시야.\n"),
        ):
            with (
                self.subTest(invalid=invalid),
                self.assertRaisesRegex(ValueError, "overlap"),
            ):
                ensure_disjoint([train], [invalid], [evaluation])
        with self.assertRaisesRegex(ValueError, "overlap"):
            ensure_disjoint(
                [train],
                [validation],
                [replace(evaluation, source_text=train.case.source_text)],
            )
        for splits in (
            ([], [validation], [evaluation]),
            ([train], [], [evaluation]),
            ([train], [validation], []),
        ):
            with self.assertRaises(ValueError):
                ensure_disjoint(*splits)
