import contextlib
import hashlib
import io
import json
import re
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from model.training.cli import _parser, main
from tests.test_preparation_review import PreparationFixture, _json_bytes


class FolderWorkflowTest(unittest.TestCase):
    def test_approve_preparation_parser_requires_only_review_paths(self):
        parser = _parser()
        required = [
            "--run-dir",
            "/tmp/run",
            "--style-profile",
            "/tmp/style.json",
            "--facts-file",
            "/tmp/facts.jsonl",
        ]

        args = parser.parse_args(["approve-preparation", *required])

        self.assertEqual(args.command, "approve-preparation")
        self.assertEqual(args.run_dir, Path("/tmp/run"))
        self.assertEqual(args.style_profile, Path("/tmp/style.json"))
        self.assertEqual(args.facts_file, Path("/tmp/facts.jsonl"))
        for training_option in (
            "model",
            "device",
            "epochs",
            "rank",
            "max_new_tokens",
        ):
            self.assertFalse(hasattr(args, training_option))
        for omitted in ("--run-dir", "--style-profile", "--facts-file"):
            incomplete = required.copy()
            index = incomplete.index(omitted)
            del incomplete[index : index + 2]
            with (
                self.subTest(omitted=omitted),
                contextlib.redirect_stderr(io.StringIO()),
                self.assertRaises(SystemExit),
            ):
                parser.parse_args(["approve-preparation", *incomplete])

    def test_train_prepared_parser_uses_sealed_run_without_model_override(self):
        args = _parser().parse_args(
            ["train-prepared", "--run-dir", "/tmp/run", "--dry-run"]
        )

        self.assertEqual(args.command, "train-prepared")
        self.assertEqual(args.run_dir, Path("/tmp/run"))
        self.assertTrue(args.dry_run)
        self.assertFalse(hasattr(args, "model"))
        self.assertFalse(hasattr(args, "style_profile"))
        self.assertFalse(hasattr(args, "facts_file"))

    def test_train_prepared_dry_run_verifies_without_model_or_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)
            before = {
                path.relative_to(fixture.run_dir).as_posix(): path.read_bytes()
                for path in fixture.run_dir.rglob("*")
                if path.is_file()
            }
            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=AssertionError("dry run must not train"),
                ),
                patch(
                    "model.training.folder_workflow.load_base_model",
                    side_effect=AssertionError("dry run must not load a model"),
                ),
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                self._train_fixture(fixture, "--dry-run")

            after = {
                path.relative_to(fixture.run_dir).as_posix(): path.read_bytes()
                for path in fixture.run_dir.rglob("*")
                if path.is_file()
            }
            self.assertEqual(before, after)
            report = json.loads(stdout.getvalue())
            self.assertEqual(report["status"], "verified_for_training")
            self.assertEqual(
                report["samples"], {"train": 2, "validation": 1, "evaluation": 3}
            )

    def test_train_prepared_publishes_private_inactive_candidate(self):
        from model.training.prepared_training import verify_candidate_seal

        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)
            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=self._fake_prepared_fit,
                ) as fit,
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                self._train_fixture(fixture)

            run = json.loads((fixture.run_dir / "run.json").read_text())
            candidate = fixture.run_dir / "candidate"
            self.assertEqual(run["status"], "pending_quality_review")
            self.assertEqual(run["candidate_dir"], "candidate")
            self.assertEqual(stat.S_IMODE(candidate.stat().st_mode), 0o700)
            seal = verify_candidate_seal(candidate)
            self.assertEqual(
                run["candidate_sha256"],
                hashlib.sha256(
                    (candidate / "candidate-seal.json").read_bytes()
                ).hexdigest(),
            )
            metadata = json.loads((candidate / "adapter.json").read_text())
            self.assertFalse(metadata["active"])
            self.assertEqual(metadata["quality_status"], "pending_review")
            self.assertEqual(metadata["approval_sha256"], seal["approval_sha256"])
            recall = json.loads(
                (candidate / "evaluation" / "training-recall.json").read_text()
            )
            self.assertFalse(recall["automatic_checks_establish_quality"])
            self.assertNotIn("Source passage", stdout.getvalue())
            self.assertFalse((fixture.run_dir / ".candidate.training").exists())
            self.assertEqual(fit.call_count, 1)

    def test_train_prepared_recovers_after_publish_and_rejects_new_config(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)
            from model.training import folder_workflow

            original_atomic_json = folder_workflow._atomic_json

            def interrupt_final_status(path, value):
                if value.get("status") == "pending_quality_review":
                    raise KeyboardInterrupt("after candidate publication")
                return original_atomic_json(path, value)

            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=self._fake_prepared_fit,
                ),
                patch(
                    "model.training.folder_workflow._atomic_json",
                    side_effect=interrupt_final_status,
                ),
                self.assertRaises(KeyboardInterrupt),
            ):
                self._train_fixture(fixture)
            self.assertTrue((fixture.run_dir / "candidate").is_dir())
            self.assertEqual(
                json.loads((fixture.run_dir / "run.json").read_text())["status"],
                "training",
            )

            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=AssertionError("recovery must not retrain"),
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self._train_fixture(fixture)
            self.assertEqual(
                json.loads((fixture.run_dir / "run.json").read_text())["status"],
                "pending_quality_review",
            )
            with self.assertRaisesRegex(ValueError, "config"):
                self._train_fixture(fixture, "--epochs", "4")

    def test_train_prepared_cleans_interrupted_unpublished_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)
            staging = fixture.run_dir / ".candidate.training"
            candidate = fixture.run_dir / "candidate"
            original_replace = Path.replace

            def interrupt_publication(path, target):
                if path == staging and target == candidate:
                    raise KeyboardInterrupt("before candidate publication")
                return original_replace(path, target)

            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=self._fake_prepared_fit,
                ),
                patch.object(type(staging), "replace", new=interrupt_publication),
                self.assertRaises(KeyboardInterrupt),
            ):
                self._train_fixture(fixture)

            self.assertFalse(staging.exists())
            self.assertFalse(candidate.exists())
            run = json.loads((fixture.run_dir / "run.json").read_text())
            self.assertEqual(run["status"], "training_failed")
            self.assertEqual(run["error"], "KeyboardInterrupt")

    def test_train_prepared_rechecks_sources_before_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)

            def mutate_after_training(*args, **kwargs):
                summary = self._fake_prepared_fit(*args, **kwargs)
                source = fixture.input_dir / "author-1.md"
                source.write_bytes(source.read_bytes() + b"\n")
                return summary

            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=mutate_after_training,
                ),
                self.assertRaisesRegex(ValueError, "source manifest"),
            ):
                self._train_fixture(fixture)

            self.assertFalse((fixture.run_dir / ".candidate.training").exists())
            self.assertFalse((fixture.run_dir / "candidate").exists())
            run = json.loads((fixture.run_dir / "run.json").read_text())
            self.assertEqual(run["status"], "training_failed")

    def test_train_prepared_remains_idempotent_after_complete_quality_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)
            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=self._fake_prepared_fit,
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self._train_fixture(fixture)

            evaluation = fixture.run_dir / "candidate" / "evaluation"
            reviews = Path(temporary) / "completed-reviews.jsonl"
            rows = [
                json.loads(line)
                for line in (evaluation / "reviews.template.jsonl")
                .read_text()
                .splitlines()
            ]
            for row in rows:
                row.update(
                    grounding_passed=True,
                    facts_preserved=True,
                    conflicts_handled=True,
                    safety_passed=True,
                )
            reviews.write_text(
                "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
            )
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                main(
                    [
                        "review",
                        "--run-dir",
                        str(evaluation),
                        "--reviews-file",
                        str(reviews),
                    ]
                )
            self.assertEqual(
                json.loads(stdout.getvalue())["status"],
                "quality_passed_pending_style_choice",
            )
            for name in (
                "final-report.json",
                "blind-comparisons.json",
                "blind-mapping.json",
            ):
                self.assertEqual(
                    stat.S_IMODE((evaluation / name).stat().st_mode), 0o600
                )

            with (
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=AssertionError("reviewed candidate must not retrain"),
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self._train_fixture(fixture)

    def test_approve_preparation_seals_without_model_or_training(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            stage_one_names = (
                "preparation.json",
                "style-profile.draft.json",
                "facts.draft.jsonl",
                "automatic-checks.json",
            )
            stage_one_bytes = {
                name: (fixture.run_dir / name).read_bytes() for name in stage_one_names
            }
            forbidden = AssertionError("approval must not load or train a model")
            with (
                patch(
                    "model.training.folder_workflow.load_base_model",
                    side_effect=forbidden,
                ),
                patch(
                    "model.training.folder_workflow.generate_text",
                    side_effect=forbidden,
                ),
                patch(
                    "model.training.folder_workflow.TrainConfig",
                    side_effect=forbidden,
                ),
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=forbidden,
                ),
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                main(
                    [
                        "approve-preparation",
                        "--run-dir",
                        str(fixture.run_dir),
                        "--style-profile",
                        str(fixture.reviewed_style_path),
                        "--facts-file",
                        str(fixture.reviewed_facts_path),
                    ]
                )

            approved_dir = fixture.run_dir / "approved"
            self.assertEqual(stat.S_IMODE(approved_dir.stat().st_mode), 0o700)
            self.assertEqual(
                {path.name for path in approved_dir.iterdir()},
                {
                    "style-profile.approved.json",
                    "facts.approved.jsonl",
                    "approval.json",
                },
            )
            self.assertTrue(
                all(
                    stat.S_IMODE(path.stat().st_mode) == 0o600
                    for path in approved_dir.iterdir()
                )
            )
            self.assertTrue(
                all(
                    path.read_bytes().endswith(b"\n") for path in approved_dir.iterdir()
                )
            )
            run = json.loads((fixture.run_dir / "run.json").read_text())
            approval_bytes = (approved_dir / "approval.json").read_bytes()
            self.assertEqual(run["status"], "approved_for_training")
            self.assertEqual(run["approval_dir"], "approved")
            self.assertEqual(
                run["approval_sha256"], hashlib.sha256(approval_bytes).hexdigest()
            )
            self.assertFalse((fixture.run_dir / "candidate").exists())
            self.assertEqual(
                stage_one_bytes,
                {
                    name: (fixture.run_dir / name).read_bytes()
                    for name in stage_one_names
                },
            )
            rendered = stdout.getvalue()
            self.assertNotIn("Alpha explains", rendered)
            self.assertNotIn("Calm and direct", rendered)
            self.assertEqual(json.loads(rendered)["status"], "approved_for_training")

    def test_approve_preparation_is_atomic_and_recovers_after_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            staging = fixture.run_dir / ".approval.preparing"
            approved_dir = fixture.run_dir / "approved"
            original_replace = Path.replace

            def interrupt_publication(path, target):
                if path == staging and target == approved_dir:
                    raise KeyboardInterrupt("before approval directory rename")
                return original_replace(path, target)

            with (
                patch.object(type(staging), "replace", new=interrupt_publication),
                self.assertRaises(KeyboardInterrupt),
            ):
                self._approve_fixture(fixture)
            self.assertFalse(staging.exists())
            self.assertFalse(approved_dir.exists())
            self.assertEqual(
                json.loads((fixture.run_dir / "run.json").read_text())["status"],
                "pending_preparation_review",
            )

            from model.training import folder_workflow

            original_atomic_json = folder_workflow._atomic_json

            def interrupt_status(path, value):
                if value.get("status") == "approved_for_training":
                    raise KeyboardInterrupt("after approval directory rename")
                return original_atomic_json(path, value)

            with (
                patch(
                    "model.training.folder_workflow._atomic_json",
                    side_effect=interrupt_status,
                ),
                self.assertRaises(KeyboardInterrupt),
            ):
                self._approve_fixture(fixture)
            self.assertTrue(approved_dir.is_dir())
            self.assertEqual(
                json.loads((fixture.run_dir / "run.json").read_text())["status"],
                "pending_preparation_review",
            )

            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)
            self.assertEqual(
                json.loads((fixture.run_dir / "run.json").read_text())["status"],
                "approved_for_training",
            )

    def test_approve_preparation_rerun_rejects_changed_or_tampered_seal(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):
                self._approve_fixture(fixture)
                self._approve_fixture(fixture)
            approved_dir = fixture.run_dir / "approved"
            original = {path.name: path.read_bytes() for path in approved_dir.iterdir()}

            run_path = fixture.run_dir / "run.json"
            run = json.loads(run_path.read_text())
            run["approval_sha256"] = "0" * 64
            run_path.write_bytes(_json_bytes(run))
            with self.assertRaisesRegex(ValueError, "run.json disagrees"):
                self._approve_fixture(fixture)
            run["approval_sha256"] = hashlib.sha256(
                original["approval.json"]
            ).hexdigest()
            run_path.write_bytes(_json_bytes(run))

            fixture.reviewed_style["profile"]["tone"] = ["Quiet and concise"]
            fixture.reviewed_style_path.write_bytes(_json_bytes(fixture.reviewed_style))
            with self.assertRaisesRegex(ValueError, "different approval"):
                self._approve_fixture(fixture)
            self.assertEqual(
                original,
                {path.name: path.read_bytes() for path in approved_dir.iterdir()},
            )

            fixture.reviewed_style["profile"]["tone"] = ["Calm and direct"]
            fixture.reviewed_style_path.write_bytes(_json_bytes(fixture.reviewed_style))
            original_statement = fixture.reviewed_facts[0]["facts"][0]["statement"]
            fixture.reviewed_facts[0]["facts"][0]["statement"] = (
                "A reviewed fact remains supported."
            )
            fixture.write_reviewed_facts()
            with self.assertRaisesRegex(ValueError, "different approval"):
                self._approve_fixture(fixture)
            fixture.reviewed_facts[0]["facts"][0]["statement"] = original_statement
            fixture.write_reviewed_facts()
            facts_path = approved_dir / "facts.approved.jsonl"
            facts_path.write_bytes(facts_path.read_bytes() + b"\n")
            with self.assertRaises(ValueError):
                self._approve_fixture(fixture)

    def test_approve_preparation_permission_failure_publishes_nothing(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            staging = fixture.run_dir / ".approval.preparing"
            original_chmod = Path.chmod

            def deny_private_mode(path, mode, *args, **kwargs):
                if path == staging:
                    raise PermissionError("cannot set private approval mode")
                return original_chmod(path, mode, *args, **kwargs)

            with (
                patch.object(type(staging), "chmod", new=deny_private_mode),
                self.assertRaises(PermissionError),
            ):
                self._approve_fixture(fixture)
            self.assertFalse(staging.exists())
            self.assertFalse((fixture.run_dir / "approved").exists())
            self.assertEqual(
                json.loads((fixture.run_dir / "run.json").read_text())["status"],
                "pending_preparation_review",
            )

    def test_approve_preparation_does_not_follow_run_temp_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            external = fixture.temporary / "external.json"
            external.write_text("do not overwrite", encoding="utf-8")
            run_temporary = fixture.run_dir / ".run.json.tmp"
            run_temporary.symlink_to(external)

            with self.assertRaisesRegex(ValueError, "must not be a symlink"):
                self._approve_fixture(fixture)

            self.assertEqual(external.read_text(), "do not overwrite")
            self.assertTrue(run_temporary.is_symlink())
            self.assertEqual(
                json.loads((fixture.run_dir / "run.json").read_text())["status"],
                "pending_preparation_review",
            )

    def test_approve_preparation_rejects_invalid_run_states_and_paths(self):
        for status in (
            "preparing",
            "preparation_failed",
            "future_state",
            "approved_for_training",
        ):
            with (
                tempfile.TemporaryDirectory() as temporary,
                self.subTest(status=status),
            ):
                fixture = PreparationFixture(Path(temporary))
                fixture.run["status"] = status
                (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))
                with self.assertRaises(ValueError):
                    self._approve_fixture(fixture)

        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            missing = fixture.temporary / "missing-run"
            with self.assertRaises(ValueError):
                self._approve_fixture(fixture, run_dir=missing)
            actual = fixture.temporary / "actual-run"
            fixture.run_dir.replace(actual)
            fixture.run_dir.symlink_to(actual, target_is_directory=True)
            with self.assertRaises(ValueError):
                self._approve_fixture(fixture)

    def _approve_fixture(self, fixture, *, run_dir=None):
        return main(
            [
                "approve-preparation",
                "--run-dir",
                str(run_dir or fixture.run_dir),
                "--style-profile",
                str(fixture.reviewed_style_path),
                "--facts-file",
                str(fixture.reviewed_facts_path),
            ]
        )

    def _train_fixture(self, fixture, *extra):
        return main(
            [
                "train-prepared",
                "--run-dir",
                str(fixture.run_dir),
                *extra,
            ]
        )

    def _fake_prepared_fit(
        self,
        args,
        training,
        validation,
        cases,
        output,
        *,
        metadata_extra=None,
        **kwargs,
    ):
        from model.evaluation.result import EvaluationResult
        from model.evaluation.runner import write_evaluation

        self.assertTrue(training)
        self.assertTrue(validation)
        self.assertEqual(len(cases), 3)
        self.assertEqual(args.model, "fixture")
        self.assertEqual(args.base_revision, "revision")
        self.assertFalse(kwargs["emit_summary"])
        self.assertTrue(kwargs["strict_evaluation_length"])
        output.mkdir()
        (output / "adapter.pt").write_bytes(b"adapter")
        (output / "metrics.json").write_text('{"selected_epoch":1}\n')
        tokenizer = output / "tokenizer"
        tokenizer.mkdir()
        (tokenizer / "tokenizer.json").write_text("{}\n")
        metadata = {
            **(metadata_extra or {}),
            "format_version": 1,
            "status": "candidate",
            "quality_status": "pending_review",
            "active": False,
            "base_model": args.model,
            "base_revision": args.base_revision,
        }
        (output / "adapter.json").write_text(
            json.dumps(metadata, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        settings = {"max_new_tokens": args.max_new_tokens, "do_sample": False}
        results = [
            EvaluationResult(
                case.id,
                approach,
                case.source_text,
                args.model,
                settings,
            )
            for case in cases
            for approach in ("prompt_baseline", "lora")
        ]
        write_evaluation(output / "evaluation", list(cases), results)
        return {
            "candidate": str(output),
            "evaluation": str(output / "evaluation"),
            "status": "pending_review",
            "selected_epoch": 1,
        }

    def test_invalid_extraction_leaves_report_without_candidate(self):
        from unittest.mock import MagicMock

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "writing"
            self.documents(root)
            output = Path(tmp) / "failed-run"
            model = MagicMock()
            model.config._commit_hash = None
            with (
                patch(
                    "model.training.folder_workflow.load_base_model",
                    return_value=(MagicMock(), model),
                ),
                patch(
                    "model.training.folder_workflow.generate_text",
                    return_value="not JSON",
                ),
                self.assertRaises(ValueError),
            ):
                main(
                    [
                        "train-folder",
                        "--input-dir",
                        str(root),
                        "--output-dir",
                        str(output),
                    ]
                )
            self.assertFalse((output / "candidate").exists())
            self.assertEqual(
                json.loads((output / "run.json").read_text())["status"], "failed"
            )
            report = json.loads((output / "preparation.json").read_text())
            self.assertEqual(len(report["skipped"]), 4)

    def documents(self, root):
        root.mkdir()
        for index in range(1, 5):
            (root / f"{index}.txt").write_text(
                f"참석자는 {index}명입니다. 서로의 이야기를 차분하게 들었습니다.",
                encoding="utf-8",
            )

    def preparation_documents(self, root):
        root.mkdir()
        for index in range(1, 4):
            (root / f"author-{index}.md").write_text(
                f"작성 문서 {index}은 핵심을 설명합니다. 부연 설명이 이어집니다.",
                encoding="utf-8",
            )
        evaluation = root / "evaluation"
        evaluation.mkdir()
        for index in range(1, 4):
            (evaluation / f"held-out-{index}.md").write_text(
                f"평가 문서 {index}은 새 주제를 설명합니다. 별도 설명이 이어집니다.",
                encoding="utf-8",
            )

    def test_dry_run_needs_only_folder_and_no_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "writing"
            self.documents(root)
            with (
                patch("model.training.folder_workflow.load_base_model") as loader,
                contextlib.redirect_stdout(io.StringIO()) as out,
            ):
                main(["train-folder", "--input-dir", str(root), "--dry-run"])
            loader.assert_not_called()
            report = json.loads(out.getvalue())
            self.assertEqual(sum(report["documents"].values()), 4)
            self.assertEqual(list(Path(tmp).iterdir()), [root])

    def test_prepare_folder_dry_run_separates_evaluation_without_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "writing"
            self.preparation_documents(root)
            with (
                patch("model.training.folder_workflow.load_base_model") as loader,
                contextlib.redirect_stdout(io.StringIO()) as out,
            ):
                main(["prepare-folder", "--input-dir", str(root), "--dry-run"])

            loader.assert_not_called()
            report = json.loads(out.getvalue())
            self.assertEqual(
                report["documents"], {"train": 2, "validation": 1, "evaluation": 3}
            )
            self.assertEqual(report["status"], "dry_run")
            self.assertEqual(list(Path(tmp).iterdir()), [root])

    def test_prepare_folder_binds_relative_local_model_to_original_cwd(self):
        from unittest.mock import MagicMock

        from model.training.folder_data import PreparedFolderDraft, StyleProfile

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            writing = root / "writing"
            self.preparation_documents(writing)
            local_model = root / "local-model"
            local_model.mkdir()
            output = root / "prepared"
            model = MagicMock()
            model.config._commit_hash = "local-revision"
            empty_draft = PreparedFolderDraft(
                style_profile=StyleProfile(
                    tone=("차분하게 설명한다",),
                    organization=("핵심을 먼저 제시한다",),
                    sentence_style=("짧은 설명문을 사용한다",),
                    formatting=("필요할 때 목록을 사용한다",),
                ),
                style_sources=(),
                facts=(),
                skipped=(),
                automatic_checks=(),
            )
            with (
                contextlib.chdir(root),
                patch(
                    "model.training.folder_workflow.load_base_model",
                    return_value=(MagicMock(), model),
                ) as loader,
                patch(
                    "model.training.folder_workflow.prepare_folder_draft",
                    return_value=empty_draft,
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                main(
                    [
                        "prepare-folder",
                        "--input-dir",
                        str(writing),
                        "--output-dir",
                        str(output),
                        "--model",
                        "local-model",
                    ]
                )

            canonical = str(local_model.resolve())
            loader.assert_called_once_with(canonical, None)
            self.assertEqual(
                json.loads((output / "run.json").read_text())["model"], canonical
            )
            self.assertEqual(
                json.loads((output / "preparation.json").read_text())[
                    "extraction_model"
                ],
                canonical,
            )

    def test_prepare_folder_rejects_invalid_layout_before_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            temporary = Path(tmp)
            for label in ("missing", "empty", "symlink"):
                with self.subTest(label=label):
                    root = temporary / label
                    root.mkdir()
                    for index in range(2):
                        (root / f"author-{index}.md").write_text(
                            f"문서 {index}의 내용입니다.", encoding="utf-8"
                        )
                    if label == "empty":
                        (root / "evaluation").mkdir()
                    elif label == "symlink":
                        actual = temporary / "actual-evaluation"
                        actual.mkdir(exist_ok=True)
                        (actual / "held-out.md").write_text(
                            "평가 내용입니다.", encoding="utf-8"
                        )
                        (root / "evaluation").symlink_to(
                            actual, target_is_directory=True
                        )
                    with (
                        patch(
                            "model.training.folder_workflow.load_base_model"
                        ) as loader,
                        self.assertRaises(ValueError),
                    ):
                        main(
                            [
                                "prepare-folder",
                                "--input-dir",
                                str(root),
                                "--output-dir",
                                str(temporary / f"run-{label}"),
                            ]
                        )
                    loader.assert_not_called()

    def test_prepare_folder_rejects_output_and_invalid_lengths_before_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            temporary = Path(tmp)
            root = temporary / "writing"
            self.preparation_documents(root)
            existing = temporary / "existing"
            existing.mkdir()
            cases = (
                ["--output-dir", str(existing)],
                ["--output-dir", str(root / "generated")],
                ["--dry-run", "--max-chars", "0"],
                ["--dry-run", "--extraction-tokens", "0"],
            )
            for extra in cases:
                with (
                    self.subTest(extra=extra),
                    patch("model.training.folder_workflow.load_base_model") as loader,
                    self.assertRaises(ValueError),
                ):
                    main(["prepare-folder", "--input-dir", str(root), *extra])
                loader.assert_not_called()

    def test_prepare_folder_writes_review_drafts_without_training(self):
        from unittest.mock import MagicMock

        with tempfile.TemporaryDirectory() as tmp:
            temporary = Path(tmp)
            root = temporary / "writing"
            self.preparation_documents(root)
            output = temporary / "prepared-run"
            staging = temporary / ".prepared-run.preparing"
            model = MagicMock()
            model.config._commit_hash = "revision-1"
            observed_statuses = []

            def extract(model, tokenizer, prompt, **kwargs):
                self.assertFalse(output.exists())
                observed_statuses.append(
                    json.loads((staging / "run.json").read_text())["status"]
                )
                if "STYLE_SOURCE_JSON: " in prompt:
                    return json.dumps(
                        {
                            "tone": ["차분하게 설명한다"],
                            "organization": ["핵심을 먼저 제시한다"],
                            "sentence_style": ["짧은 설명문을 사용한다"],
                            "formatting": ["필요할 때 목록을 사용한다"],
                        },
                        ensure_ascii=False,
                    )
                passage = json.loads(prompt.rsplit("FACT_SOURCE_JSON: ", 1)[1])
                evidence = passage.split(". ", 1)[0] + "."
                return json.dumps(
                    {
                        "facts": [
                            {
                                "statement": evidence,
                                "evidence_spans": [evidence],
                            }
                        ]
                    },
                    ensure_ascii=False,
                )

            with (
                patch(
                    "model.training.folder_workflow.load_base_model",
                    return_value=(MagicMock(), model),
                ),
                patch(
                    "model.training.folder_workflow.generate_text", side_effect=extract
                ),
                patch(
                    "model.training.folder_workflow.fit_candidate",
                    side_effect=AssertionError("training must not run"),
                ),
                patch(
                    "model.training.folder_workflow.TrainConfig",
                    side_effect=AssertionError("training config must not be built"),
                ),
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                main(
                    [
                        "prepare-folder",
                        "--input-dir",
                        str(root),
                        "--output-dir",
                        str(output),
                        "--device",
                        "cpu",
                    ]
                )

            self.assertTrue(observed_statuses)
            self.assertEqual(set(observed_statuses), {"preparing"})
            run = json.loads((output / "run.json").read_text())
            self.assertEqual(run["status"], "pending_preparation_review")
            self.assertNotIn("candidate", run)
            preparation = json.loads((output / "preparation.json").read_text())
            self.assertEqual(preparation["schema_version"], 1)
            self.assertEqual(preparation["semantic_review"], "pending")
            self.assertEqual(preparation["extraction_revision"], "revision-1")
            self.assertEqual(preparation["samples"]["evaluation"], 3)
            profile = json.loads((output / "style-profile.draft.json").read_text())
            self.assertEqual(profile["status"], "pending_review")
            self.assertEqual(
                set(profile["profile"]),
                {"tone", "organization", "sentence_style", "formatting"},
            )
            facts = [
                json.loads(line)
                for line in (output / "facts.draft.jsonl").read_text().splitlines()
            ]
            self.assertEqual(len(facts), 6)
            self.assertTrue(all(item["facts"] for item in facts))
            checks = json.loads((output / "automatic-checks.json").read_text())
            self.assertFalse(checks["automatic_checks_establish_semantic_approval"])
            self.assertTrue(checks["checks"])
            self.assertFalse((output / "candidate").exists())
            self.assertFalse(any(output.glob("*.approved.*")))
            self.assertFalse(any(output.glob("*.tmp")))
            rendered = stdout.getvalue()
            self.assertNotIn("작성 문서", rendered)
            self.assertNotIn("차분하게 설명한다", rendered)
            self.assertEqual(
                json.loads(rendered)["status"], "pending_preparation_review"
            )

    def test_prepare_folder_failure_keeps_only_auditable_run_state(self):
        from unittest.mock import MagicMock

        with tempfile.TemporaryDirectory() as tmp:
            temporary = Path(tmp)
            root = temporary / "writing"
            self.preparation_documents(root)
            output = temporary / "failed-preparation"
            staging = temporary / ".failed-preparation.preparing"
            model = MagicMock()
            model.config._commit_hash = None

            def fail_after_start(*args, **kwargs):
                self.assertFalse(output.exists())
                self.assertEqual(
                    json.loads((staging / "run.json").read_text())["status"],
                    "preparing",
                )
                return "not JSON"

            with (
                patch(
                    "model.training.folder_workflow.load_base_model",
                    return_value=(MagicMock(), model),
                ),
                patch(
                    "model.training.folder_workflow.generate_text",
                    side_effect=fail_after_start,
                ),
                self.assertRaises(ValueError),
            ):
                main(
                    [
                        "prepare-folder",
                        "--input-dir",
                        str(root),
                        "--output-dir",
                        str(output),
                    ]
                )

            run = json.loads((output / "run.json").read_text())
            self.assertEqual(run["status"], "preparation_failed")
            self.assertTrue(run["error"])
            for name in (
                "preparation.json",
                "style-profile.draft.json",
                "facts.draft.jsonl",
                "automatic-checks.json",
            ):
                self.assertFalse((output / name).exists())
            self.assertFalse((output / "candidate").exists())
            self.assertFalse(any(output.glob("*.tmp")))

    def test_prepare_folder_interrupt_during_publication_cleans_partial_drafts(self):
        from unittest.mock import MagicMock

        with tempfile.TemporaryDirectory() as tmp:
            temporary = Path(tmp)
            root = temporary / "writing"
            self.preparation_documents(root)
            output = temporary / "interrupted-preparation"
            staging = temporary / ".interrupted-preparation.preparing"
            model = MagicMock()
            model.config._commit_hash = None

            def extract(model, tokenizer, prompt, **kwargs):
                if "STYLE_SOURCE_JSON: " in prompt:
                    return json.dumps(
                        {
                            "tone": ["차분하게 설명한다"],
                            "organization": ["핵심을 먼저 제시한다"],
                            "sentence_style": ["짧은 설명문을 사용한다"],
                            "formatting": ["필요할 때 목록을 사용한다"],
                        },
                        ensure_ascii=False,
                    )
                passage = json.loads(prompt.rsplit("FACT_SOURCE_JSON: ", 1)[1])
                evidence = passage.split(". ", 1)[0] + "."
                return json.dumps(
                    {
                        "facts": [
                            {
                                "statement": evidence,
                                "evidence_spans": [evidence],
                            }
                        ]
                    },
                    ensure_ascii=False,
                )

            original_replace = Path.replace
            interrupted = False

            def interrupt_directory_publication(path, target):
                nonlocal interrupted
                if path.is_dir() and not interrupted:
                    interrupted = True
                    raise KeyboardInterrupt("simulated publication interrupt")
                return original_replace(path, target)

            with (
                patch(
                    "model.training.folder_workflow.load_base_model",
                    return_value=(MagicMock(), model),
                ),
                patch(
                    "model.training.folder_workflow.generate_text", side_effect=extract
                ),
                patch.object(
                    type(staging), "replace", new=interrupt_directory_publication
                ),
                self.assertRaises(KeyboardInterrupt),
            ):
                main(
                    [
                        "prepare-folder",
                        "--input-dir",
                        str(root),
                        "--output-dir",
                        str(output),
                    ]
                )

            run = json.loads((output / "run.json").read_text())
            self.assertEqual(run["status"], "preparation_failed")
            for name in (
                "preparation.json",
                "style-profile.draft.json",
                "facts.draft.jsonl",
                "automatic-checks.json",
            ):
                self.assertFalse((output / name).exists())
            self.assertFalse(any(output.glob(".*.tmp")))

    def test_auto_data_to_real_tiny_training_and_evaluation(self):
        from tokenizers import Tokenizer
        from tokenizers.models import WordLevel
        from tokenizers.pre_tokenizers import Whitespace
        from transformers import PreTrainedTokenizerFast, Qwen3Config, Qwen3ForCausalLM

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "writing"
            self.documents(root)
            raw = Tokenizer(WordLevel({"[UNK]": 0, "[EOS]": 1}, unk_token="[UNK]"))
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
            model = Qwen3ForCausalLM(
                Qwen3Config(
                    vocab_size=8,
                    hidden_size=8,
                    intermediate_size=16,
                    num_hidden_layers=1,
                    num_attention_heads=1,
                    num_key_value_heads=1,
                    head_dim=8,
                    max_position_embeddings=2048,
                )
            )
            output = Path(tmp) / "run"

            def extract(model, tokenizer, prompt, **kwargs):
                return json.dumps(
                    {
                        "facts": [
                            "참석자는 " + re.search(r"[1-4]명입니다\.", prompt).group()
                        ]
                    },
                    ensure_ascii=False,
                )

            with (
                patch(
                    "model.training.folder_workflow.load_base_model",
                    return_value=(tokenizer, model),
                ),
                patch(
                    "model.training.folder_workflow.generate_text", side_effect=extract
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                main(
                    [
                        "train-folder",
                        "--input-dir",
                        str(root),
                        "--output-dir",
                        str(output),
                        "--device",
                        "cpu",
                        "--max-new-tokens",
                        "2",
                        "--epochs",
                        "1",
                    ]
                )
            for name in ("train", "validation", "evaluation"):
                self.assertTrue((output / "data" / f"{name}.jsonl").is_file())
            data = [
                json.loads(line)
                for line in (output / "data" / "train.jsonl").read_text().splitlines()
            ]
            self.assertTrue(all(item["target_review"] is None for item in data))
            originals = {p.read_text() for p in root.iterdir()}
            self.assertTrue(all(item["target_text"] in originals for item in data))
            metadata = json.loads((output / "candidate" / "adapter.json").read_text())
            self.assertEqual(
                metadata["training_data_status"], "auto_derived_unreviewed"
            )
            report = json.loads(
                (output / "candidate" / "evaluation" / "report.json").read_text()
            )
            self.assertEqual(report["status"], "pending_review")

    def test_existing_or_nested_output_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "writing"
            self.documents(root)
            for output in (root / "generated", Path(tmp)):
                with patch("model.training.folder_workflow.load_base_model") as loader:
                    with self.assertRaises(ValueError):
                        main(
                            [
                                "train-folder",
                                "--input-dir",
                                str(root),
                                "--output-dir",
                                str(output),
                            ]
                        )
                    loader.assert_not_called()


if __name__ == "__main__":
    unittest.main()
