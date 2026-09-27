import hashlib
import json
import unittest

from model.training.corpus import Document
from model.training.folder_data import prepare_folder_data, split_folder_documents


def doc(path, text):
    return Document(path, text, hashlib.sha256(text.encode()).hexdigest())


def extract(prompt):
    passage = json.loads(prompt.rsplit("SOURCE_JSON: ", 1)[1])
    return json.dumps({"facts": [passage.split(".")[0]]})


class FolderDataTest(unittest.TestCase):
    def test_document_split_is_stable_and_normalizes_duplicates(self):
        documents = [doc(str(i), f"Document {i}. Body.") for i in range(10)]
        documents.append(doc("duplicate", "Ｄocument   0. BODY."))
        first = split_folder_documents(documents)
        self.assertEqual(first, split_folder_documents(list(reversed(documents))))
        self.assertEqual([len(first[k]) for k in first], [6, 2, 2])
        self.assertEqual(len({d.path for group in first.values() for d in group}), 10)
        with self.assertRaisesRegex(ValueError, "3"):
            split_folder_documents(documents[:2])

    def test_original_targets_and_only_other_training_document_styles(self):
        splits = {
            "train": [
                doc("a", "Alpha fact. My voice."),
                doc("b", "Beta fact. Other voice."),
            ],
            "validation": [doc("c", "Gamma fact. Secret style.")],
            "evaluation": [doc("d", "Delta fact. Hidden style.")],
        }
        result = prepare_folder_data(splits, extract)
        self.assertEqual(
            [e.target_text for e in result.training], [d.text for d in splits["train"]]
        )
        self.assertIn("Other voice.", result.training[0].case.style)
        self.assertIn("My voice.", result.training[1].case.style)
        for records in result.records.values():
            for record in records:
                self.assertNotIn("Secret style.", record["style"])
                self.assertNotIn("Hidden style.", record["style"])
                self.assertEqual(record["provenance"], "auto_derived_unreviewed")
                self.assertIsNone(record["target_review"])
                self.assertNotIn("grounding_passed", record)
                self.assertEqual(record["schema_version"], 2)
                self.assertIn("literal_facts", record)
                json.dumps(record)
        self.assertNotIn("target_text", result.records["evaluation"][0])

    def test_folder_v2_literals_keep_numeric_tokens_only(self):
        passage = "Meeting on 2026-10-03 at 14:00 costs 500원. Friendly ending."
        result = prepare_folder_data(
            {"train": [doc("a", passage)]},
            lambda _: json.dumps(
                {"facts": ["Meeting on 2026-10-03 at 14:00 costs 500원."]}
            ),
        )
        case = result.training[0].case
        self.assertEqual(case.schema_version, 2)
        self.assertEqual(case.literal_facts, ("2026-10-03", "14:00", "500원."))
        self.assertEqual(
            case.expected_facts, ("Meeting on 2026-10-03 at 14:00 costs 500원.",)
        )

    def test_segments_stay_in_the_document_split_and_preserve_original_text(self):
        splits = {
            name: [doc(name, f"{name} first. Voice.\n\n{name} next. Voice.")]
            for name in ("train", "validation", "evaluation")
        }
        result = prepare_folder_data(splits, extract, max_chars=30)
        self.assertEqual(len(result.training), 2)
        for name, records in result.records.items():
            for record in records:
                self.assertEqual(record["source_document"]["path"], name)
                if "target_text" in record:
                    self.assertIn(record["target_text"], splits[name][0].text)
                    self.assertLessEqual(len(record["target_text"]), 30)
        self.assertNotIn("train first.", result.training[0].case.style)

    def test_invalid_facts_are_skipped_without_approval(self):
        passage = "Meeting 2026-10-03 at 14:00 costs 500원. Friendly ending."
        for facts in (
            ["invented"],
            ["Meeting"],
            [passage],
            [],
            ["Meeting", "Meeting"],
            ["500원", "2026-10-03"],
        ):
            with self.subTest(facts=facts):
                result = prepare_folder_data(
                    {"train": [doc("a", passage)]},
                    lambda _, facts=facts: json.dumps({"facts": facts}),
                )
                self.assertFalse(result.training)
                self.assertEqual(len(result.skipped), 1)
                self.assertTrue(result.skipped[0]["reason"])
        result = prepare_folder_data(
            {"train": [doc("a", passage)]},
            lambda _: (
                "```json\n"
                + json.dumps({"facts": ["Meeting 2026-10-03 at 14:00 costs 500원."]})
                + "\n```"
            ),
        )
        self.assertEqual(len(result.training), 1)

    def test_deduplicates_passages_and_evidence_across_splits(self):
        splits = {
            "train": [
                doc("a", "Shared fact. First voice.\n\nUnique fact. Common ending.")
            ],
            "validation": [
                doc("b", "Shared fact. Second voice.\n\nUnique fact. Common ending.")
            ],
            "evaluation": [doc("c", "Different fact. Third voice.")],
        }
        result = prepare_folder_data(splits, extract, max_chars=35)
        self.assertEqual(len(result.training), 2)
        self.assertFalse(result.validation)
        self.assertEqual(len(result.skipped), 2)
        self.assertEqual(len(result.evaluation), 1)

    def test_rejects_malformed_extractor_output(self):
        for value in ("hello", "[]", '{"facts": "fact"}', '{"facts": [3]}'):
            result = prepare_folder_data(
                {"train": [doc("a", "A fact. Voice.")]}, lambda _, value=value: value
            )
            self.assertFalse(result.training)
            self.assertTrue(result.skipped)

    def test_rejects_reordered_and_overlapping_full_target_evidence(self):
        passage = "Alpha fact. Beta fact."
        for facts in (
            ["Beta fact.", "Alpha fact."],
            ["Alpha fact. Beta", "fact. Beta fact."],
            ["Alpha fact.", "Beta fact"],
        ):
            with self.subTest(facts=facts):
                result = prepare_folder_data(
                    {"train": [doc("a", passage)]},
                    lambda _, facts=facts: json.dumps({"facts": facts}),
                )
                self.assertFalse(result.training)
                self.assertIn("copy task", result.skipped[0]["reason"])
        result = prepare_folder_data(
            {"train": [doc("a", passage)]},
            lambda _: json.dumps({"facts": ["Alpha"]}),
        )
        self.assertEqual(len(result.training), 1)
        self.assertIsNone(result.records["train"][0]["target_review"])
