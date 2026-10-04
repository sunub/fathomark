import hashlib
import json
import os
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from model.evaluation.result import EvaluationResult
from model.training.folder_data import FactDraft, FactStatement, StyleProfile
from model.training.preparation_review import ApprovedPreparation, approved_artifacts
from model.training.prepared_training import (
    PreparedDatasets,
    build_prepared_datasets,
    load_prepared_training,
    seal_candidate,
    training_input_record,
    training_recall_diagnostics,
    verify_candidate_seal,
)
from tests.test_preparation_review import PreparationFixture, _json_bytes


def _approved() -> ApprovedPreparation:
    style = StyleProfile(
        tone=("Calm",),
        organization=("Lead with the conclusion",),
        sentence_style=("Use short sentences",),
        formatting=("Use lists sparingly",),
    )
    facts = []
    rows = (
        ("train", "train/private.md", "Private project 9182 launches Monday."),
        (
            "validation",
            "validation/private.md",
            "Read https://secret.test/guide carefully.",
        ),
        ("evaluation", "evaluation/one.md", "Public launch is Tuesday."),
        ("evaluation", "evaluation/two.md", "Public review is Wednesday."),
        ("evaluation", "evaluation/three.md", "Public close is Thursday."),
    )
    for index, (split, path, statement) in enumerate(rows):
        source_passage = f"Source passage {index}: {statement} Additional private wording remains here."
        literal = statement.split()[3] if split == "evaluation" else ()
        facts.append(
            FactDraft(
                id=f"folder-{index}",
                split=split,
                source_document={"path": path, "sha256": f"{index + 1:064x}"},
                passage_index=0,
                source_passage=source_passage,
                facts=(
                    FactStatement(
                        statement=statement,
                        evidence_spans=(statement,),
                        required_literals=(literal,) if literal else (),
                    ),
                ),
                target_text=None if split == "evaluation" else source_passage,
            )
        )
    return ApprovedPreparation(style, tuple(facts), "a" * 64, "b" * 64)


def _complete_candidate(
    candidate: Path,
    approval_sha256: str,
    config: dict[str, object] | None = None,
) -> None:
    if config is None:
        config = {"epochs": 1}
    (candidate / "tokenizer").mkdir(parents=True)
    (candidate / "evaluation").mkdir()
    training_input = {
        "schema_version": 1,
        "approval_sha256": approval_sha256,
        "source_manifest_sha256": "f" * 64,
        "base_model": "model",
        "base_revision": "revision",
        "hyperparameters": config,
        "split_counts": {"train": 1, "validation": 1, "evaluation": 3},
        "dataset_sha256": "e" * 64,
    }
    training_input_bytes = json.dumps(training_input).encode()
    (candidate / "training-input.json").write_bytes(training_input_bytes)
    (candidate / "adapter.json").write_text(
        json.dumps(
            {
                "format_version": 1,
                "status": "candidate",
                "active": False,
                "quality_status": "pending_review",
                "approval_sha256": approval_sha256,
                "source_manifest_sha256": training_input["source_manifest_sha256"],
                "base_model": training_input["base_model"],
                "base_revision": training_input["base_revision"],
                "training_input_sha256": hashlib.sha256(
                    training_input_bytes
                ).hexdigest(),
            }
        )
    )
    (candidate / "adapter.pt").write_bytes(b"weights")
    (candidate / "metrics.json").write_text("{}")
    (candidate / "tokenizer" / "tokenizer.json").write_text("{}")
    for name in (
        "cases.jsonl",
        "results.jsonl",
        "reviews.template.jsonl",
        "automatic-checks.json",
        "report.json",
        "training-recall.json",
    ):
        (candidate / "evaluation" / name).write_text("{}\n")


def _publish_approval(
    fixture: PreparationFixture, status: str = "approved_for_training"
) -> dict[str, bytes]:
    artifacts = approved_artifacts(fixture.approve())
    approved_dir = fixture.run_dir / "approved"
    approved_dir.mkdir(mode=0o700)
    approved_dir.chmod(0o700)
    for name, data in artifacts.items():
        path = approved_dir / name
        path.write_bytes(data)
        path.chmod(0o600)
    fixture.run = {
        **fixture.run,
        "status": status,
        "approval_dir": "approved",
        "approval_sha256": hashlib.sha256(artifacts["approval.json"]).hexdigest(),
    }
    (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))
    return artifacts


class PreparedInputTest(unittest.TestCase):
    def test_loads_complete_approved_input_and_recovery_status(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            _publish_approval(fixture)

            loaded = load_prepared_training(fixture.run_dir)

            self.assertEqual(len(loaded.datasets.training), 2)
            self.assertEqual(len(loaded.datasets.validation), 1)
            self.assertEqual(len(loaded.datasets.evaluation), 3)
            self.assertEqual(loaded.base_model, "fixture")
            self.assertEqual(loaded.base_revision, "revision")

            fixture.run["status"] = "training"
            (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))
            self.assertEqual(
                load_prepared_training(fixture.run_dir).approval_sha256,
                fixture.run["approval_sha256"],
            )

    def test_rejects_run_hash_draft_source_and_bundle_drift(self):
        mutations = {
            "run hash": lambda fixture: fixture.run.update(approval_sha256="0" * 64),
            "draft bytes": lambda fixture: (
                fixture.run_dir / "facts.draft.jsonl"
            ).write_text(
                (fixture.run_dir / "facts.draft.jsonl").read_text() + " ",
                encoding="utf-8",
            ),
            "source whitespace": lambda fixture: (
                fixture.input_dir / "author-1.md"
            ).write_text(
                (fixture.input_dir / "author-1.md").read_text() + " ",
                encoding="utf-8",
            ),
            "bundle bytes": lambda fixture: (
                fixture.run_dir / "approved" / "style-profile.approved.json"
            ).write_text("{}\n", encoding="utf-8"),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                fixture = PreparationFixture(Path(temporary))
                _publish_approval(fixture)
                mutate(fixture)
                if label == "run hash":
                    (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))
                with self.assertRaises((TypeError, ValueError)):
                    load_prepared_training(fixture.run_dir)

    def test_training_recovery_reruns_normalized_approved_comparison(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            _publish_approval(fixture, status="training")
            approved_dir = fixture.run_dir / "approved"
            facts_path = approved_dir / "facts.approved.jsonl"
            lines = facts_path.read_bytes().splitlines(keepends=True)
            facts_path.write_bytes(b"".join(reversed(lines)))
            facts_path.chmod(0o600)
            approval_path = approved_dir / "approval.json"
            approval = json.loads(approval_path.read_text())
            approval["facts_sha256"] = hashlib.sha256(
                facts_path.read_bytes()
            ).hexdigest()
            approval_path.write_bytes(_json_bytes(approval))
            approval_path.chmod(0o600)
            fixture.run["approval_sha256"] = hashlib.sha256(
                approval_path.read_bytes()
            ).hexdigest()
            (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))

            with self.assertRaisesRegex(ValueError, "normalized approved artifact"):
                load_prepared_training(fixture.run_dir)

    def test_rejects_style_copied_from_held_out_evaluation_passage(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = PreparationFixture(Path(temporary))
            held_out = next(iter(fixture.splits["evaluation"])).text
            fixture.reviewed_style["profile"]["tone"] = [held_out]
            fixture.reviewed_style_path.write_bytes(_json_bytes(fixture.reviewed_style))
            _publish_approval(fixture)

            with self.assertRaisesRegex(ValueError, "copies a long source phrase"):
                load_prepared_training(fixture.run_dir)


class PreparedDatasetTest(unittest.TestCase):
    def test_builds_deterministic_disjoint_prompt_safe_datasets(self):
        approved = _approved()

        first = build_prepared_datasets(approved)
        second = build_prepared_datasets(approved)

        self.assertEqual(first, second)
        self.assertEqual(len(first.training), 1)
        self.assertEqual(len(first.validation), 1)
        self.assertEqual(len(first.evaluation), 3)
        self.assertTrue(all(case.schema_version == 2 for case in first.evaluation))
        self.assertEqual(
            first.evaluation[0].expected_facts, ("Public launch is Tuesday.",)
        )
        self.assertEqual(first.evaluation[0].literal_facts, ("Tuesday.",))
        self.assertEqual(
            first.training[0].target_text,
            approved.facts[0].source_passage,
        )

        prompt_values = [
            example.case.source_text for example in (*first.training, *first.validation)
        ] + [case.source_text for case in first.evaluation]
        rendered_style = first.training[0].case.style
        self.assertEqual(
            rendered_style,
            "tone:\n- Calm\n\norganization:\n- Lead with the conclusion\n\n"
            "sentence_style:\n- Use short sentences\n\nformatting:\n- Use lists sparingly",
        )
        for value in prompt_values:
            self.assertNotIn("Source passage", value)
            self.assertNotIn("private.md", value)
            self.assertNotIn("evidence", value)

    def test_rejects_incomplete_or_overlapping_partitions(self):
        approved = _approved()
        without_validation = ApprovedPreparation(
            approved.style_profile,
            tuple(fact for fact in approved.facts if fact.split != "validation"),
            approved.draft_input_sha256,
            approved.source_manifest_sha256,
        )
        with self.assertRaisesRegex(ValueError, "validation must be nonempty"):
            build_prepared_datasets(without_validation)

        too_few_evaluation = ApprovedPreparation(
            approved.style_profile,
            approved.facts[:-1],
            approved.draft_input_sha256,
            approved.source_manifest_sha256,
        )
        with self.assertRaisesRegex(ValueError, "at least 3"):
            build_prepared_datasets(too_few_evaluation)

        duplicate = ApprovedPreparation(
            approved.style_profile,
            (*approved.facts, approved.facts[0]),
            approved.draft_input_sha256,
            approved.source_manifest_sha256,
        )
        with self.assertRaisesRegex(ValueError, "duplicate"):
            build_prepared_datasets(duplicate)

        first = approved.facts[0]
        same_statement = FactDraft(
            id="folder-extra-train",
            split="train",
            source_document={"path": "extra.md", "sha256": "9" * 64},
            passage_index=0,
            source_passage="A different target passage with enough private wording.",
            facts=first.facts,
            target_text="A different target passage with enough private wording.",
        )
        partial_duplicate = ApprovedPreparation(
            approved.style_profile,
            (*approved.facts, same_statement),
            approved.draft_input_sha256,
            approved.source_manifest_sha256,
        )
        with self.assertRaisesRegex(ValueError, "duplicate approved fact statement"):
            build_prepared_datasets(partial_duplicate)

    def test_training_recall_diagnostics_hash_matches_without_raw_training_text(self):
        prepared = build_prepared_datasets(_approved())
        first_case = prepared.evaluation[0]
        prepared = PreparedDatasets(
            prepared.training,
            prepared.validation,
            (
                replace(
                    first_case,
                    source_text=(
                        "The approved code is 19182 and the reference is "
                        "https://secret.test/guide/extended."
                    ),
                    expected_facts=(
                        (
                            "The approved code is 19182 and the reference is "
                            "https://secret.test/guide/extended."
                        ),
                    ),
                    literal_facts=("19182",),
                ),
                *prepared.evaluation[1:],
            ),
        )
        results = []
        for case in prepared.evaluation:
            for approach in ("prompt_baseline", "lora"):
                answer = case.source_text
                if case.id == "folder-2" and approach == "prompt_baseline":
                    answer = (
                        "The answer repeats 9182 and https://secret.test/guide. "
                        "Additional private wording remains here."
                    )
                results.append(
                    EvaluationResult(
                        case.id,
                        approach,
                        answer,
                        "model",
                        {"max_new_tokens": 32},
                    )
                )

        report = training_recall_diagnostics(prepared, results)

        self.assertFalse(report["automatic_checks_establish_quality"])
        self.assertTrue(report["diagnostics_only"])
        serialized = json.dumps(report, sort_keys=True)
        self.assertNotIn("9182", serialized)
        self.assertNotIn("secret.test", serialized)
        baseline = report["checks"][0]
        self.assertEqual(len(baseline["numeric_token_sha256"]), 1)
        self.assertEqual(len(baseline["url_sha256"]), 1)
        self.assertGreaterEqual(len(baseline["long_phrase_sha256"]), 1)
        self.assertEqual(report["checks"][1]["numeric_token_sha256"], [])


class CandidateSealTest(unittest.TestCase):
    def test_recursive_private_seal_binds_approval_config_and_exact_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            candidate = Path(temporary) / "candidate"
            config = {"epochs": 3, "learning_rate": 0.0001}
            _complete_candidate(candidate, "c" * 64, config)
            (candidate / "adapter" / "nested").mkdir(parents=True)
            (candidate / "adapter" / "nested" / "weights.bin").write_bytes(b"weights")
            (candidate / "adapter" / "nested" / "candidate-seal.json").write_text(
                "nested payload"
            )
            seal = seal_candidate(candidate, "c" * 64, config)

            self.assertEqual(seal, verify_candidate_seal(candidate, "c" * 64, config))
            self.assertEqual(oct(candidate.stat().st_mode & 0o777), "0o700")
            for path in candidate.rglob("*"):
                expected = 0o700 if path.is_dir() else 0o600
                self.assertEqual(path.stat().st_mode & 0o777, expected)
            self.assertIn("adapter/nested/weights.bin", seal["files"])
            self.assertIn("adapter/nested/candidate-seal.json", seal["files"])

            for name in (
                "final-report.json",
                "blind-comparisons.json",
                "blind-mapping.json",
            ):
                path = candidate / "evaluation" / name
                path.write_text("{}\n")
                path.chmod(0o600)
            self.assertEqual(seal, verify_candidate_seal(candidate, "c" * 64, config))

            (candidate / "adapter" / "nested" / "weights.bin").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                verify_candidate_seal(candidate, "c" * 64, config)

    def test_seal_rejects_symlinks_and_config_mismatch(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            candidate = root / "candidate"
            _complete_candidate(candidate, "d" * 64)
            (root / "outside").write_text("outside")
            os.symlink(root / "outside", candidate / "link")
            with self.assertRaisesRegex(ValueError, "symlink"):
                seal_candidate(candidate, "d" * 64, {"epochs": 1})

        with tempfile.TemporaryDirectory() as temporary:
            candidate = Path(temporary) / "candidate"
            _complete_candidate(candidate, "d" * 64)
            seal_candidate(candidate, "d" * 64, {"epochs": 1})
            with self.assertRaisesRegex(ValueError, "config"):
                verify_candidate_seal(candidate, "d" * 64, {"epochs": 2})

    def test_seal_requires_complete_inactive_pending_review_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            candidate = Path(temporary) / "candidate"
            candidate.mkdir()
            (candidate / "training-input.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "required file"):
                seal_candidate(candidate, "d" * 64, {"epochs": 1})

        with tempfile.TemporaryDirectory() as temporary:
            candidate = Path(temporary) / "candidate"
            _complete_candidate(candidate, "d" * 64)
            metadata = json.loads((candidate / "adapter.json").read_text())
            metadata["active"] = True
            (candidate / "adapter.json").write_text(json.dumps(metadata))
            with self.assertRaisesRegex(ValueError, "active must be false"):
                seal_candidate(candidate, "d" * 64, {"epochs": 1})

        with tempfile.TemporaryDirectory() as temporary:
            candidate = Path(temporary) / "candidate"
            _complete_candidate(candidate, "d" * 64)
            metadata = json.loads((candidate / "adapter.json").read_text())
            metadata["base_revision"] = "different"
            (candidate / "adapter.json").write_text(json.dumps(metadata))
            with self.assertRaisesRegex(ValueError, "base_revision mismatch"):
                seal_candidate(candidate, "d" * 64, {"epochs": 1})

    def test_training_input_record_is_canonical_and_complete(self):
        prepared = build_prepared_datasets(_approved())
        first = training_input_record(
            prepared,
            approval_sha256="e" * 64,
            source_manifest_sha256="f" * 64,
            base_model="base/model",
            base_revision="revision",
            hyperparameters={"epochs": 3},
        )
        second = training_input_record(
            prepared,
            approval_sha256="e" * 64,
            source_manifest_sha256="f" * 64,
            base_model="base/model",
            base_revision="revision",
            hyperparameters={"epochs": 3},
        )
        self.assertEqual(first, second)
        self.assertEqual(
            first["split_counts"], {"train": 1, "validation": 1, "evaluation": 3}
        )
        self.assertEqual(len(first["dataset_sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
