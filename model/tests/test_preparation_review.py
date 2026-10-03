import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

from model.training.corpus import Document, load_documents
from model.training.folder_data import _passages, split_preparation_documents
from model.training.preparation_review import (
    approved_artifacts,
    review_preparation,
    verify_approval_bundle,
)


def _json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


class PreparationFixture:
    def __init__(self, temporary: Path):
        self.temporary = temporary
        self.input_dir = temporary / "writing"
        self.input_dir.mkdir()
        for index, word in enumerate(("Alpha", "Beta", "Gamma"), start=1):
            (self.input_dir / f"author-{index}.md").write_text(
                f"{word} explains a distinct topic clearly. Extra context remains separate.",
                encoding="utf-8",
            )
        evaluation_dir = self.input_dir / "evaluation"
        evaluation_dir.mkdir()
        for index, word in enumerate(("Delta", "Epsilon", "Zeta"), start=1):
            (evaluation_dir / f"held-{index}.md").write_text(
                f"{word} records a fresh subject carefully. More context remains separate.",
                encoding="utf-8",
            )

        training = load_documents(
            self.input_dir, excluded_relative_dirs=frozenset({"evaluation"})
        )
        evaluation = [
            Document(f"evaluation/{item.path}", item.text, item.sha256)
            for item in load_documents(evaluation_dir)
        ]
        self.splits = split_preparation_documents(training, evaluation, 42)
        self.manifest = {
            split: [
                {"path": document.path, "sha256": document.sha256}
                for document in self.splits[split]
            ]
            for split in ("train", "validation", "evaluation")
        }
        self.run_dir = temporary / "run"
        self.run_dir.mkdir()
        self.run = {
            "schema_version": 1,
            "command": "prepare-folder",
            "input_dir": str(self.input_dir),
            "output_dir": str(self.run_dir),
            "model": "fixture",
            "device": "cpu",
            "max_chars": 1200,
            "extraction_tokens": 128,
            "seed": 42,
            "documents": {split: len(items) for split, items in self.splits.items()},
            "status": "pending_preparation_review",
        }
        (self.run_dir / "run.json").write_bytes(_json_bytes(self.run))

        style_sources = [
            {"path": item.path, "sha256": item.sha256}
            for item in sorted(self.splits["train"], key=lambda item: item.path)
        ]
        self.style = {
            "schema_version": 1,
            "status": "pending_review",
            "source_documents": style_sources,
            "profile": {
                "tone": ["Calm and direct"],
                "organization": ["Lead with the point"],
                "sentence_style": ["Use concise sentences"],
                "formatting": ["Use lists when useful"],
            },
        }
        (self.run_dir / "style-profile.draft.json").write_bytes(_json_bytes(self.style))

        self.facts = []
        checks = []
        for document in self.splits["train"]:
            for passage_index, _ in enumerate(_passages(document.text, 1200)):
                checks.append(
                    {
                        "check": "style_profile_leakage",
                        "source_document": {
                            "path": document.path,
                            "sha256": document.sha256,
                        },
                        "passage_index": passage_index,
                        "status": "passed",
                    }
                )
        for split in ("train", "validation", "evaluation"):
            for document in self.splits[split]:
                for passage_index, passage in enumerate(_passages(document.text, 1200)):
                    statement = passage.split(" Extra", 1)[0].split(" More", 1)[0]
                    digest = hashlib.sha256(
                        (document.sha256 + "\0" + passage).encode()
                    ).hexdigest()
                    row = {
                        "id": "folder-" + digest,
                        "split": split,
                        "source_document": {
                            "path": document.path,
                            "sha256": document.sha256,
                        },
                        "passage_index": passage_index,
                        "source_passage": passage,
                        "facts": [
                            {
                                "statement": statement,
                                "evidence_spans": [statement],
                                "required_literals": [],
                            }
                        ],
                        "target_text": None if split == "evaluation" else passage,
                    }
                    self.facts.append(row)
                    checks.append(
                        {
                            "check": "grounded_fact_structure",
                            "split": split,
                            "source_document": row["source_document"],
                            "passage_index": passage_index,
                            "status": "passed",
                        }
                    )
        (self.run_dir / "facts.draft.jsonl").write_text(
            "".join(json.dumps(row) + "\n" for row in self.facts), encoding="utf-8"
        )
        preparation = {
            "schema_version": 1,
            "documents": self.manifest,
            "samples": {
                split: sum(row["split"] == split for row in self.facts)
                for split in ("train", "validation", "evaluation")
            },
            "skipped": [],
            "automatic_checks_only": True,
            "semantic_review": "pending",
            "extraction_model": "fixture",
            "extraction_revision": "revision",
        }
        (self.run_dir / "preparation.json").write_bytes(_json_bytes(preparation))
        (self.run_dir / "automatic-checks.json").write_bytes(
            _json_bytes(
                {
                    "schema_version": 1,
                    "automatic_checks_establish_semantic_approval": False,
                    "checks": checks,
                }
            )
        )

        self.reviewed_style_path = temporary / "reviewed-style.json"
        self.reviewed_style = {**self.style, "status": "approved"}
        self.reviewed_style_path.write_bytes(_json_bytes(self.reviewed_style))
        self.reviewed_facts_path = temporary / "reviewed-facts.jsonl"
        self.reviewed_facts = [
            {**row, "review_status": "approved"} for row in self.facts
        ]
        self.write_reviewed_facts()

    def write_reviewed_facts(self):
        self.reviewed_facts_path.write_text(
            "".join(json.dumps(row) + "\n" for row in self.reviewed_facts),
            encoding="utf-8",
        )

    def approve(self):
        return review_preparation(
            self.run_dir, self.reviewed_style_path, self.reviewed_facts_path
        )


class PreparationReviewTest(unittest.TestCase):
    def fixture(self, temporary):
        return PreparationFixture(Path(temporary))

    def test_accepts_explicit_review_and_normalizes_draft_order(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            fixture.reviewed_facts.reverse()
            fixture.write_reviewed_facts()

            approved = fixture.approve()
            artifacts = approved_artifacts(approved)
            rows = [
                json.loads(line)
                for line in artifacts["facts.approved.jsonl"].decode().splitlines()
            ]

            self.assertEqual(
                [row["id"] for row in rows], [row["id"] for row in fixture.facts]
            )
            self.assertTrue(all(row["review_status"] == "approved" for row in rows))
            self.assertEqual(rows[0]["facts"][0]["required_literals"], [])
            self.assertEqual(len(approved.draft_input_sha256), 64)
            self.assertEqual(len(approved.source_manifest_sha256), 64)

    def test_rejects_missing_duplicate_and_unknown_fact_ids(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            variants = {
                "missing": fixture.reviewed_facts[:-1],
                "duplicate": [*fixture.reviewed_facts, fixture.reviewed_facts[0]],
                "unknown": [
                    *fixture.reviewed_facts[:-1],
                    {**fixture.reviewed_facts[-1], "id": "folder-unknown"},
                ],
            }
            for label, rows in variants.items():
                with self.subTest(label=label):
                    fixture.reviewed_facts = rows
                    fixture.write_reviewed_facts()
                    with self.assertRaises(ValueError):
                        fixture.approve()

    def test_rejects_every_immutable_fact_field(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            replacements = {
                "id": "folder-changed",
                "split": "evaluation",
                "source_document": {"path": "changed.md", "sha256": "0" * 64},
                "passage_index": 9,
                "source_passage": "Changed source passage.",
                "target_text": "Changed target.",
            }
            for field, replacement in replacements.items():
                with self.subTest(field=field):
                    fixture.reviewed_facts = [
                        {**row, **({field: replacement} if index == 0 else {})}
                        for index, row in enumerate(
                            [
                                {**item, "review_status": "approved"}
                                for item in fixture.facts
                            ]
                        )
                    ]
                    fixture.write_reviewed_facts()
                    with self.assertRaises(ValueError):
                        fixture.approve()

    def test_rejects_immutable_passage_index_json_type_changes(self):
        for replacement in (False, 0.0):
            with (
                tempfile.TemporaryDirectory() as temporary,
                self.subTest(replacement=replacement),
            ):
                fixture = self.fixture(temporary)
                fixture.reviewed_facts[0]["passage_index"] = replacement
                fixture.write_reviewed_facts()

                with self.assertRaisesRegex(ValueError, "passage_index"):
                    fixture.approve()

    def test_allows_valid_fact_correction_and_recomputes_literals(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            passage = fixture.reviewed_facts[0]["source_passage"]
            statement = passage.split(" Extra", 1)[0].split(" More", 1)[0]
            fixture.reviewed_facts[0]["facts"] = [
                {
                    "statement": statement,
                    "evidence_spans": [statement],
                    "required_literals": ["untrusted"],
                }
            ]
            fixture.write_reviewed_facts()

            approved = fixture.approve()

            self.assertEqual(approved.facts[0].facts[0].required_literals, ())

    def test_accepts_consistent_stage_one_skipped_passage_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            skipped = fixture.facts.pop(0)
            facts_path = fixture.run_dir / "facts.draft.jsonl"
            facts_path.write_text(
                "".join(json.dumps(row) + "\n" for row in fixture.facts),
                encoding="utf-8",
            )
            checks_path = fixture.run_dir / "automatic-checks.json"
            checks = json.loads(checks_path.read_text())
            matching_check = next(
                check
                for check in checks["checks"]
                if check.get("split") == skipped["split"]
                and check["source_document"] == skipped["source_document"]
                and check["passage_index"] == skipped["passage_index"]
            )
            matching_check["status"] = "failed"
            matching_check["reason"] = "fixture extractor rejected this passage"
            checks_path.write_bytes(_json_bytes(checks))
            preparation_path = fixture.run_dir / "preparation.json"
            preparation = json.loads(preparation_path.read_text())
            preparation["samples"][skipped["split"]] -= 1
            preparation["skipped"] = [
                {
                    "check": "grounded_fact_structure",
                    "split": skipped["split"],
                    "source_document": skipped["source_document"],
                    "passage_index": skipped["passage_index"],
                    "reason": matching_check["reason"],
                }
            ]
            preparation_path.write_bytes(_json_bytes(preparation))
            fixture.reviewed_facts = [
                {**row, "review_status": "approved"} for row in fixture.facts
            ]
            fixture.write_reviewed_facts()

            approved = fixture.approve()

            self.assertEqual(len(approved.facts), len(fixture.facts))

    def test_rejects_source_drift_and_automatic_check_tampering(self):
        for label in (
            "added",
            "deleted",
            "renamed",
            "modified",
            "whitespace",
            "duplicate",
            "symlink",
            "evaluation-symlink",
            "check",
        ):
            with tempfile.TemporaryDirectory() as temporary, self.subTest(label=label):
                fixture = self.fixture(temporary)
                if label == "added":
                    (fixture.input_dir / "added.md").write_text(
                        "A newly added source.", encoding="utf-8"
                    )
                elif label == "deleted":
                    (fixture.input_dir / "author-1.md").unlink()
                elif label == "renamed":
                    (fixture.input_dir / "author-1.md").rename(
                        fixture.input_dir / "renamed.md"
                    )
                elif label == "modified":
                    source = fixture.input_dir / "author-1.md"
                    source.write_text(source.read_text() + " changed", encoding="utf-8")
                elif label == "whitespace":
                    source = fixture.input_dir / "author-1.md"
                    source.write_bytes(source.read_bytes() + b"\n")
                elif label == "duplicate":
                    source = fixture.input_dir / "author-1.md"
                    (fixture.input_dir / "duplicate.md").write_text(
                        source.read_text(), encoding="utf-8"
                    )
                elif label == "symlink":
                    (fixture.input_dir / "linked.md").symlink_to(
                        fixture.input_dir / "author-1.md"
                    )
                elif label == "evaluation-symlink":
                    evaluation = fixture.input_dir / "evaluation"
                    (evaluation / "linked.md").symlink_to(evaluation / "held-1.md")
                else:
                    path = fixture.run_dir / "automatic-checks.json"
                    data = json.loads(path.read_text())
                    data["checks"][0]["passage_index"] = 99
                    path.write_bytes(_json_bytes(data))
                with self.assertRaises(ValueError):
                    fixture.approve()

    def test_rejects_markers_schema_provenance_and_missing_artifacts(self):
        variants = (
            "style-marker",
            "fact-marker",
            "style-schema",
            "style-provenance",
            "run-command",
            "missing-artifact",
            "artifact-symlink",
        )
        for label in variants:
            with tempfile.TemporaryDirectory() as temporary, self.subTest(label=label):
                fixture = self.fixture(temporary)
                if label == "style-marker":
                    fixture.reviewed_style["status"] = "pending_review"
                    fixture.reviewed_style_path.write_bytes(
                        _json_bytes(fixture.reviewed_style)
                    )
                elif label == "fact-marker":
                    fixture.reviewed_facts[0]["review_status"] = "pending"
                    fixture.write_reviewed_facts()
                elif label == "style-schema":
                    fixture.reviewed_style["schema_version"] = 2
                    fixture.reviewed_style_path.write_bytes(
                        _json_bytes(fixture.reviewed_style)
                    )
                elif label == "style-provenance":
                    fixture.reviewed_style["source_documents"] = []
                    fixture.reviewed_style_path.write_bytes(
                        _json_bytes(fixture.reviewed_style)
                    )
                elif label == "run-command":
                    fixture.run["command"] = "train-folder"
                    (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))
                elif label == "missing-artifact":
                    (fixture.run_dir / "preparation.json").unlink()
                else:
                    path = fixture.run_dir / "preparation.json"
                    target = fixture.temporary / "actual-preparation.json"
                    path.replace(target)
                    path.symlink_to(target)
                with self.assertRaises((TypeError, ValueError)):
                    fixture.approve()

    def test_rejects_malformed_inputs_and_stage_one_schema_versions(self):
        for label in (
            "style-json",
            "facts-jsonl",
            "run-schema",
            "preparation-schema",
            "checks-schema",
        ):
            with tempfile.TemporaryDirectory() as temporary, self.subTest(label=label):
                fixture = self.fixture(temporary)
                if label == "style-json":
                    fixture.reviewed_style_path.write_text("{", encoding="utf-8")
                elif label == "facts-jsonl":
                    fixture.reviewed_facts_path.write_text("{\n", encoding="utf-8")
                elif label == "run-schema":
                    fixture.run["schema_version"] = 2
                    (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))
                else:
                    name = (
                        "preparation.json"
                        if label == "preparation-schema"
                        else "automatic-checks.json"
                    )
                    path = fixture.run_dir / name
                    value = json.loads(path.read_text())
                    value["schema_version"] = 2
                    path.write_bytes(_json_bytes(value))
                with self.assertRaises(ValueError):
                    fixture.approve()

    def test_rejects_cross_split_statement_set_created_by_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            indices = [
                next(
                    index
                    for index, row in enumerate(fixture.reviewed_facts)
                    if row["split"] == split
                )
                for split in ("train", "validation")
            ]
            for index in indices:
                fixture.reviewed_facts[index]["facts"] = [
                    {
                        "statement": "Context remains separate.",
                        "evidence_spans": ["context remains separate."],
                        "required_literals": [],
                    }
                ]
            fixture.write_reviewed_facts()

            with self.assertRaisesRegex(ValueError, "duplicate normalized"):
                fixture.approve()

    def test_draft_digest_changes_for_byte_only_stage_one_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            original = fixture.approve().draft_input_sha256
            preparation_path = fixture.run_dir / "preparation.json"
            preparation_path.write_bytes(preparation_path.read_bytes() + b"\n")

            changed = fixture.approve().draft_input_sha256

            self.assertNotEqual(original, changed)

    def test_rejects_invalid_utf8_symlinks_and_wrong_state(self):
        for label in ("utf8", "review-symlink", "run-symlink", "state"):
            with tempfile.TemporaryDirectory() as temporary, self.subTest(label=label):
                fixture = self.fixture(temporary)
                if label == "utf8":
                    fixture.reviewed_style_path.write_bytes(b"\xff")
                elif label == "review-symlink":
                    target = fixture.temporary / "actual-style.json"
                    fixture.reviewed_style_path.replace(target)
                    fixture.reviewed_style_path.symlink_to(target)
                elif label == "run-symlink":
                    actual = fixture.temporary / "actual-run"
                    fixture.run_dir.replace(actual)
                    fixture.run_dir.symlink_to(actual, target_is_directory=True)
                else:
                    fixture.run["status"] = "preparing"
                    (fixture.run_dir / "run.json").write_bytes(_json_bytes(fixture.run))
                with self.assertRaises(ValueError):
                    fixture.approve()

    def test_seal_changes_with_approved_bytes_and_verifies_private_bundle(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            artifacts = approved_artifacts(fixture.approve())
            approved_dir = fixture.temporary / "approved"
            approved_dir.mkdir(mode=0o700)
            os.chmod(approved_dir, 0o700)
            for name, data in artifacts.items():
                path = approved_dir / name
                path.write_bytes(data)
                os.chmod(path, 0o600)

            seal = verify_approval_bundle(approved_dir)

            self.assertEqual(
                seal["style_profile_sha256"],
                hashlib.sha256(artifacts["style-profile.approved.json"]).hexdigest(),
            )
            facts_path = approved_dir / "facts.approved.jsonl"
            facts_path.write_bytes(facts_path.read_bytes().replace(b"\n", b" \n", 1))
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                verify_approval_bundle(approved_dir)

    def test_approved_style_and_fact_edits_change_their_content_seals(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = self.fixture(temporary)
            original = json.loads(
                approved_artifacts(fixture.approve())["approval.json"]
            )

            fixture.reviewed_style["profile"]["tone"] = ["Quiet and concise"]
            fixture.reviewed_style_path.write_bytes(_json_bytes(fixture.reviewed_style))
            style_changed = json.loads(
                approved_artifacts(fixture.approve())["approval.json"]
            )
            self.assertNotEqual(
                original["style_profile_sha256"],
                style_changed["style_profile_sha256"],
            )
            self.assertEqual(original["facts_sha256"], style_changed["facts_sha256"])

            fixture.reviewed_style["profile"]["tone"] = ["Calm and direct"]
            fixture.reviewed_style_path.write_bytes(_json_bytes(fixture.reviewed_style))
            fixture.reviewed_facts[0]["facts"][0]["statement"] = (
                "A reviewed fact remains supported."
            )
            fixture.write_reviewed_facts()
            facts_changed = json.loads(
                approved_artifacts(fixture.approve())["approval.json"]
            )
            self.assertEqual(
                original["style_profile_sha256"],
                facts_changed["style_profile_sha256"],
            )
            self.assertNotEqual(original["facts_sha256"], facts_changed["facts_sha256"])


if __name__ == "__main__":
    unittest.main()
