import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from model.training.cli import main


def row(case_id, source, target=None):
    from model.evaluation.case import EvaluationCase
    from model.training.supervised import target_fingerprint

    result = {
        "id": case_id,
        "request": "근거를 짧게 안내해 줘.",
        "source_text": source,
        "style": "문장을 짧고 차분하게 씁니다.",
        "expected_facts": [source],
    }
    if target is not None:
        result.update(
            target_text=target,
            target_review={
                "target_sha256": target_fingerprint(
                    EvaluationCase.from_dict(result), target
                ),
                "grounding_passed": True,
                "facts_preserved": True,
                "conflicts_handled": True,
                "safety_passed": True,
                "unsupported_claims": [],
            },
        )
    return result


def write_rows(path, rows):
    path.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows),
        encoding="utf-8",
    )


class TrainingWorkflowTest(unittest.TestCase):
    def test_fit_candidate_honors_revision_and_can_return_without_output(self):
        import torch

        from model.training.workflow import fit_candidate

        args = SimpleNamespace(
            model="remote/model",
            base_revision="recorded-revision",
            device="cpu",
            epochs=1,
            learning_rate=1e-4,
            accumulation_steps=1,
            seed=7,
            max_length=32,
            max_new_tokens=4,
            rank=2,
            alpha=4.0,
        )
        model = SimpleNamespace(
            config=SimpleNamespace(_commit_hash="recorded-revision"),
            parameters=lambda: iter([SimpleNamespace(dtype=torch.float32)]),
        )
        output = Path("/private/staging-candidate")
        with (
            patch(
                "model.training.workflow.load_base_model",
                return_value=(object(), model),
            ) as loader,
            patch(
                "model.training.workflow.build_supervised_samples",
                side_effect=[["training"], ["validation"]],
            ),
            patch("model.training.workflow._case_manifest", return_value=[]),
            patch("model.training.workflow._results", side_effect=[[], []]),
            patch("model.training.workflow.inject_lora", return_value=["q_proj"]),
            patch(
                "model.training.workflow.fit",
                return_value={"selected_epoch": 1},
            ),
            patch("model.training.workflow.save_candidate"),
            patch(
                "model.training.workflow.write_evaluation",
                return_value={"status": "pending_review"},
            ),
            contextlib.redirect_stdout(io.StringIO()) as stdout,
        ):
            summary = fit_candidate(
                args,
                [object()],
                [object()],
                [object()],
                output,
                emit_summary=False,
            )

        loader.assert_called_once_with(
            "remote/model", torch.device("cpu"), revision="recorded-revision"
        )
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(
            summary,
            {
                "candidate": str(output),
                "evaluation": str(output / "evaluation"),
                "status": "pending_review",
                "selected_epoch": 1,
            },
        )

    def test_fit_candidate_preserves_legacy_summary_output(self):
        import torch

        from model.training.workflow import fit_candidate

        args = SimpleNamespace(
            model="remote/model",
            device=None,
            epochs=1,
            learning_rate=1e-4,
            accumulation_steps=1,
            seed=7,
            max_length=32,
            max_new_tokens=4,
            rank=2,
            alpha=4.0,
        )
        model = SimpleNamespace(
            config=SimpleNamespace(_commit_hash=None),
            parameters=lambda: iter([SimpleNamespace(dtype=torch.float32)]),
        )
        output = Path("candidate")
        with (
            patch(
                "model.training.workflow.load_base_model",
                return_value=(object(), model),
            ) as loader,
            patch(
                "model.training.workflow.build_supervised_samples",
                side_effect=[["training"], ["validation"]],
            ),
            patch("model.training.workflow._case_manifest", return_value=[]),
            patch("model.training.workflow._results", side_effect=[[], []]),
            patch("model.training.workflow.inject_lora", return_value=["q_proj"]),
            patch(
                "model.training.workflow.fit",
                return_value={"selected_epoch": 1},
            ),
            patch("model.training.workflow.save_candidate"),
            patch(
                "model.training.workflow.write_evaluation",
                return_value={"status": "pending_review"},
            ),
            contextlib.redirect_stdout(io.StringIO()) as stdout,
        ):
            summary = fit_candidate(args, [object()], [object()], [object()], output)

        loader.assert_called_once_with("remote/model", None)
        self.assertEqual(json.loads(stdout.getvalue()), summary)

    def test_fit_candidate_rejects_overlength_prepared_evaluation_prompt(self):
        from model.evaluation.case import EvaluationCase
        from model.training.workflow import fit_candidate

        args = SimpleNamespace(
            model="remote/model",
            device=None,
            epochs=1,
            learning_rate=1e-4,
            accumulation_steps=1,
            seed=7,
            max_length=8,
            max_new_tokens=4,
            rank=2,
            alpha=4.0,
        )
        tokenizer = SimpleNamespace(
            apply_chat_template=lambda *args, **kwargs: "long prompt",
            encode=lambda *args, **kwargs: list(range(9)),
        )
        case = EvaluationCase(
            id="held-out",
            request="write",
            source_text="fact",
            style="style",
            expected_facts=("fact",),
        )
        with (
            patch(
                "model.training.workflow.load_base_model",
                return_value=(tokenizer, object()),
            ),
            patch(
                "model.training.workflow.build_supervised_samples",
                side_effect=[["training"], ["validation"]],
            ),
            patch("model.training.workflow._results") as results,
            self.assertRaisesRegex(ValueError, "held-out.*9 tokens"),
        ):
            fit_candidate(
                args,
                [object()],
                [object()],
                [case],
                Path("candidate"),
                strict_evaluation_length=True,
            )
        results.assert_not_called()

    def test_fit_candidate_rejects_loaded_revision_drift_before_generation(self):
        from model.training.workflow import fit_candidate

        args = SimpleNamespace(
            model="remote/model",
            base_revision="approved-revision",
            device=None,
            epochs=1,
            learning_rate=1e-4,
            accumulation_steps=1,
            seed=7,
            max_length=32,
            max_new_tokens=4,
            rank=2,
            alpha=4.0,
        )
        model = SimpleNamespace(
            config=SimpleNamespace(_commit_hash="different-revision"),
            parameters=lambda: iter([SimpleNamespace(dtype="float32")]),
        )
        with (
            patch(
                "model.training.workflow.load_base_model",
                return_value=(object(), model),
            ),
            patch(
                "model.training.workflow.build_supervised_samples",
                side_effect=[["training"], ["validation"]],
            ),
            patch("model.training.workflow._results") as results,
            self.assertRaisesRegex(ValueError, "revision differs"),
        ):
            fit_candidate(
                args,
                [object()],
                [object()],
                [],
                Path("candidate"),
            )
        results.assert_not_called()

    def test_evaluation_rejects_original_trained_passage(self):
        from model.evaluation.case import EvaluationCase
        from model.training.supervised import SupervisedExample
        from model.training.workflow import _case_manifest, _check_seen_cases

        original = "Alpha fact. My voice."
        example = SupervisedExample(
            EvaluationCase(
                "train", "write", '["Alpha fact."]', "short", ("Alpha fact.",)
            ),
            original,
        )
        metadata = {"training_cases": _case_manifest([example])}
        with self.assertRaises(ValueError):
            _check_seen_cases(
                metadata,
                [EvaluationCase("new", "write", original, "short", ("Alpha fact.",))],
            )

    def test_evaluation_rejects_normalized_training_source(self):
        from model.evaluation.case import EvaluationCase
        from model.training.workflow import _check_seen_cases, _fingerprint

        metadata = {
            "training_cases": [
                {"id": "train", "source_sha256": _fingerprint("Room Ａ opens Monday")}
            ]
        }
        with self.assertRaises(ValueError):
            _check_seen_cases(
                metadata,
                [
                    EvaluationCase(
                        "test", "describe", "room A opens monday", "plain", ("monday",)
                    )
                ],
            )

    def test_duplicate_evaluation_ids_fail_before_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            write_rows(tmp / "train.jsonl", [row("t", "서울", "서울")])
            write_rows(tmp / "validation.jsonl", [row("v", "부산", "부산")])
            write_rows(tmp / "eval.jsonl", [row("e", "대전"), row("e", "제주")])
            with patch("model.training.workflow.load_base_model") as loader:
                with self.assertRaises(ValueError):
                    main(
                        [
                            "train-supervised",
                            "--train-file",
                            str(tmp / "train.jsonl"),
                            "--validation-file",
                            str(tmp / "validation.jsonl"),
                            "--eval-file",
                            str(tmp / "eval.jsonl"),
                            "--dry-run",
                        ]
                    )
                loader.assert_not_called()

    def test_supervised_dry_run_checks_splits_without_loading_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            for name, item in [
                ("train", row("t", "서울", "서울")),
                ("validation", row("v", "부산", "부산")),
                ("eval", row("e", "대전")),
            ]:
                write_rows(tmp / f"{name}.jsonl", [item])
            with (
                patch("model.training.workflow.load_base_model") as loader,
                contextlib.redirect_stdout(io.StringIO()) as out,
            ):
                main(
                    [
                        "train-supervised",
                        "--train-file",
                        str(tmp / "train.jsonl"),
                        "--validation-file",
                        str(tmp / "validation.jsonl"),
                        "--eval-file",
                        str(tmp / "eval.jsonl"),
                        "--dry-run",
                    ]
                )
            loader.assert_not_called()
            self.assertEqual(json.loads(out.getvalue())["evaluation_cases"], 1)

    def test_dry_run_rejects_training_target_as_evaluation_source_before_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            write_rows(
                tmp / "train.jsonl",
                [row("t", "회의는 금요일입니다.", "회의는 금요일입니다.")],
            )
            write_rows(tmp / "validation.jsonl", [row("v", "부산", "부산")])
            write_rows(tmp / "eval.jsonl", [row("e", "회의는 금요일입니다.")])
            with patch("model.training.workflow.load_base_model") as loader:
                with self.assertRaisesRegex(ValueError, "overlap"):
                    main(
                        [
                            "train-supervised",
                            "--train-file",
                            str(tmp / "train.jsonl"),
                            "--validation-file",
                            str(tmp / "validation.jsonl"),
                            "--eval-file",
                            str(tmp / "eval.jsonl"),
                            "--dry-run",
                        ]
                    )
                loader.assert_not_called()

    def test_saved_candidate_rejects_target_as_evaluation_source_before_model(self):
        from model.training.supervised import source_fingerprint

        metadata = {
            "training_cases": [
                {
                    "id": "train",
                    "source_sha256": source_fingerprint("source"),
                    "target_sha256": source_fingerprint("held out answer"),
                }
            ],
            "validation_cases": [],
            "documents": {},
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            write_rows(tmp / "eval.jsonl", [row("e", "held out answer")])
            with (
                patch(
                    "model.training.workflow.read_candidate",
                    return_value=(metadata, {}),
                ),
                patch("model.training.workflow.load_base_model") as loader,
                self.assertRaisesRegex(ValueError, "overlap"),
            ):
                main(
                    [
                        "evaluate",
                        "--adapter-dir",
                        str(tmp / "adapter"),
                        "--cases-file",
                        str(tmp / "eval.jsonl"),
                        "--output-dir",
                        str(tmp / "output"),
                    ]
                )
            loader.assert_not_called()

    def test_actual_local_supervised_training_then_review_workflow(self):
        from tokenizers import Tokenizer
        from tokenizers.models import WordLevel
        from tokenizers.pre_tokenizers import Whitespace
        from transformers import PreTrainedTokenizerFast, Qwen3Config, Qwen3ForCausalLM

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            base = tmp / "base"
            Qwen3ForCausalLM(
                Qwen3Config(
                    vocab_size=16,
                    hidden_size=8,
                    intermediate_size=16,
                    num_hidden_layers=1,
                    num_attention_heads=1,
                    num_key_value_heads=1,
                    head_dim=8,
                    max_position_embeddings=2048,
                )
            ).save_pretrained(base)
            raw = Tokenizer(
                WordLevel(
                    {"[UNK]": 0, "[EOS]": 1, "서울": 2, "부산": 3, "대전": 4},
                    unk_token="[UNK]",
                )
            )
            raw.pre_tokenizer = Whitespace()
            tokenizer = PreTrainedTokenizerFast(
                tokenizer_object=raw,
                unk_token="[UNK]",
                eos_token="[EOS]",
                pad_token="[EOS]",
            )
            tokenizer.chat_template = (
                "{% for m in messages %}{{ m['content'] }}{% endfor %}"
            )
            tokenizer.save_pretrained(base)
            for name, item in [
                ("train", row("t", "서울", "서울")),
                ("validation", row("v", "부산", "부산")),
                ("eval", row("e", "대전")),
            ]:
                write_rows(tmp / f"{name}.jsonl", [item])
            output = tmp / "candidate"
            with contextlib.redirect_stdout(io.StringIO()):
                main(
                    [
                        "train-supervised",
                        "--train-file",
                        str(tmp / "train.jsonl"),
                        "--validation-file",
                        str(tmp / "validation.jsonl"),
                        "--eval-file",
                        str(tmp / "eval.jsonl"),
                        "--output-dir",
                        str(output),
                        "--model",
                        str(base),
                        "--device",
                        "cpu",
                        "--max-new-tokens",
                        "2",
                        "--max-length",
                        "1024",
                        "--rank",
                        "2",
                    ]
                )
            metadata = json.loads((output / "adapter.json").read_text())
            self.assertEqual(metadata["objective"], "supervised_response")
            self.assertEqual(
                json.loads((output / "evaluation" / "report.json").read_text())[
                    "status"
                ],
                "pending_review",
            )
            self.assertTrue(
                (output / "evaluation" / "reviews.template.jsonl").is_file()
            )
            self.assertFalse(metadata.get("active", False))
            reviews = []
            for line in (
                (output / "evaluation" / "reviews.template.jsonl")
                .read_text()
                .splitlines()
            ):
                review = json.loads(line)
                for field in (
                    "grounding_passed",
                    "facts_preserved",
                    "conflicts_handled",
                    "safety_passed",
                ):
                    review[field] = False
                reviews.append(review)
            review_path = tmp / "reviews.jsonl"
            write_rows(review_path, reviews)
            with contextlib.redirect_stdout(io.StringIO()):
                main(
                    [
                        "review",
                        "--run-dir",
                        str(output / "evaluation"),
                        "--reviews-file",
                        str(review_path),
                    ]
                )
            final = json.loads(
                (output / "evaluation" / "final-report.json").read_text()
            )
            self.assertEqual(final["status"], "rejected")
            self.assertFalse(final["activated"])
            with contextlib.redirect_stdout(io.StringIO()):
                main(
                    [
                        "evaluate",
                        "--adapter-dir",
                        str(output),
                        "--cases-file",
                        str(tmp / "eval.jsonl"),
                        "--output-dir",
                        str(tmp / "reevaluation"),
                        "--device",
                        "cpu",
                        "--max-new-tokens",
                        "2",
                    ]
                )
            # An unrelated evaluation using the training source must be rejected.
            with self.assertRaises(ValueError):
                main(
                    [
                        "evaluate",
                        "--adapter-dir",
                        str(output),
                        "--cases-file",
                        str(tmp / "train.jsonl"),
                        "--output-dir",
                        str(tmp / "leaked"),
                        "--device",
                        "cpu",
                    ]
                )


if __name__ == "__main__":
    unittest.main()
