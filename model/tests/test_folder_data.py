import hashlib
import json
import unittest

from model.training.corpus import Document
from model.training.folder_data import (
    prepare_folder_data,
    prepare_folder_draft,
    split_folder_documents,
    split_preparation_documents,
)


def doc(path, text):
    return Document(path, text, hashlib.sha256(text.encode()).hexdigest())


def extract(prompt):
    passage = json.loads(prompt.rsplit("SOURCE_JSON: ", 1)[1])
    return json.dumps({"facts": [passage.split(".")[0]]})


def fact_draft_response(prompt):
    passage = json.loads(prompt.rsplit("FACT_SOURCE_JSON: ", 1)[1])
    evidence = passage.split(". ", 1)[0] + "."
    return json.dumps(
        {"facts": [{"statement": evidence, "evidence_spans": [evidence]}]},
        ensure_ascii=False,
    )


def style_draft_response():
    return json.dumps(
        {
            "tone": ["차분하게 설명한다"],
            "organization": ["핵심을 먼저 제시한다"],
            "sentence_style": ["짧은 설명문을 사용한다"],
            "formatting": ["필요할 때 목록을 사용한다"],
        },
        ensure_ascii=False,
    )


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

    def test_preparation_split_keeps_explicit_evaluation_isolated(self):
        documents = [
            doc(f"{index}.md", f"Document {index}. Body.") for index in range(10)
        ]
        evaluation = [doc("evaluation/new-topic.md", "Held out topic. Fresh voice.")]

        first = split_preparation_documents(documents, evaluation, seed=23)

        self.assertEqual(
            first,
            split_preparation_documents(list(reversed(documents)), evaluation, seed=23),
        )
        self.assertEqual(first["evaluation"], evaluation)
        self.assertEqual([len(first[name]) for name in first], [8, 2, 1])
        self.assertNotEqual(
            (first["train"], first["validation"]),
            (
                split_preparation_documents(documents, evaluation, seed=24)["train"],
                split_preparation_documents(documents, evaluation, seed=24)[
                    "validation"
                ],
            ),
        )

    def test_preparation_split_requires_distinct_nonoverlapping_groups(self):
        first = doc("a.md", "First document.")
        second = doc("b.md", "Second document.")
        evaluation = doc("evaluation/c.md", "Evaluation document.")

        for documents, held_out in (
            ([], [evaluation]),
            ([first], [evaluation]),
            ([first, second], []),
        ):
            with (
                self.subTest(documents=documents, held_out=held_out),
                self.assertRaises(ValueError),
            ):
                split_preparation_documents(documents, held_out)

        duplicate = doc("evaluation/duplicate.md", "Ｆirst   DOCUMENT.")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            split_preparation_documents([first, second], [duplicate])

    def test_draft_profile_uses_only_valid_training_observations(self):
        splits = {
            "train": [
                doc(
                    "a.md",
                    "Alpha team solved the caching issue carefully. The summary stays concise.",
                ),
                doc(
                    "b.md",
                    "Beta team reviewed the rendering issue calmly. The conclusion stays concise.",
                ),
                doc(
                    "c.md",
                    "Gamma team documented the release process clearly. The ending stays concise.",
                ),
            ],
            "validation": [
                doc(
                    "v.md",
                    "Validation secret remains isolated. Another detail follows.",
                )
            ],
            "evaluation": [
                doc(
                    f"evaluation/e{index}.md",
                    f"Held out topic {word} stays isolated. Additional context follows.",
                )
                for index, word in enumerate(("one", "two", "three"), start=1)
            ],
        }
        style_sources = []

        def draft_extract(prompt):
            if "STYLE_SOURCE_JSON: " not in prompt:
                return fact_draft_response(prompt)
            source = json.loads(prompt.rsplit("STYLE_SOURCE_JSON: ", 1)[1])
            style_sources.append(source)
            if source.startswith("Gamma"):
                return json.dumps(
                    {
                        "tone": ["https://example.com"],
                        "organization": ["단계를 순서대로 설명한다"],
                        "sentence_style": ["짧은 설명문을 사용한다"],
                        "formatting": ["목록을 사용한다"],
                    },
                    ensure_ascii=False,
                )
            return json.dumps(
                {
                    "tone": ["차분하게 설명한다", "핵심을 직접 전달한다"],
                    "organization": ["문제를 먼저 제시한다"],
                    "sentence_style": ["짧은 설명문을 사용한다"],
                    "formatting": ["필요할 때 목록을 사용한다"],
                },
                ensure_ascii=False,
            )

        result = prepare_folder_draft(splits, draft_extract)

        self.assertEqual(style_sources, [item.text for item in splits["train"]])
        self.assertEqual(result.style_profile.tone[0], "차분하게 설명한다")
        self.assertEqual(len(result.style_sources), 2)
        self.assertEqual(
            {item["path"] for item in result.style_sources}, {"a.md", "b.md"}
        )
        self.assertTrue(
            any(
                check["check"] == "style_profile_leakage"
                and check["status"] == "failed"
                for check in result.automatic_checks
            )
        )
        serialized = json.dumps(result.style_profile.__dict__, ensure_ascii=False)
        self.assertNotIn("Validation secret", serialized)
        self.assertNotIn("Held out topic", serialized)

    def test_draft_profile_rejects_each_content_leakage_class(self):
        base_splits = {
            "train": [
                doc(
                    "a.md",
                    "These four source words form a distinctive copied phrase. More text follows.",
                ),
                doc(
                    "b.md",
                    "Second source explains a concept calmly. More text follows.",
                ),
                doc(
                    "c.md",
                    "Third source explains a concept clearly. More text follows.",
                ),
            ],
            "validation": [
                doc("v.md", "Validation source is separate. More text follows.")
            ],
            "evaluation": [
                doc(
                    f"evaluation/e{index}.md",
                    f"Evaluation {word} is separate. More text follows.",
                )
                for index, word in enumerate(("one", "two", "three"), start=1)
            ],
        }
        invalid_values = (
            "https://example.com",
            "숫자 42를 사용한다",
            "`inline_code()`를 사용한다",
            "These four source words form a distinctive copied phrase",
        )
        for invalid in invalid_values:
            with self.subTest(invalid=invalid):

                def draft_extract(prompt, invalid=invalid):
                    if "STYLE_SOURCE_JSON: " not in prompt:
                        return fact_draft_response(prompt)
                    source = json.loads(prompt.rsplit("STYLE_SOURCE_JSON: ", 1)[1])
                    tone = (
                        invalid if source.startswith("These") else "차분하게 설명한다"
                    )
                    return json.dumps(
                        {
                            "tone": [tone],
                            "organization": ["문제를 먼저 제시한다"],
                            "sentence_style": ["짧게 설명한다"],
                            "formatting": ["목록을 활용한다"],
                        },
                        ensure_ascii=False,
                    )

                result = prepare_folder_draft(base_splits, draft_extract)
                self.assertEqual(len(result.style_sources), 2)
                self.assertNotIn(invalid, result.style_profile.tone)
                self.assertTrue(
                    any(
                        check["status"] == "failed" for check in result.automatic_checks
                    )
                )

    def test_fact_drafts_bind_complete_statements_to_literal_evidence(self):
        splits = {
            "train": [
                doc(
                    "a.md",
                    "페이지의 LCP는 5.3초로 측정되었다. 추가 설명이 이어진다.",
                ),
                doc(
                    "b.md", "두 번째 문서는 결과를 차분히 설명한다. 맺음말이 이어진다."
                ),
            ],
            "validation": [
                doc("v.md", "검증 문서는 결론을 먼저 제시한다. 부연 설명이 이어진다.")
            ],
            "evaluation": [
                doc(
                    f"evaluation/e{index}.md",
                    f"평가 문서 {word}는 새로운 주제를 설명한다. 별도 설명이 이어진다.",
                )
                for index, word in enumerate(("하나", "둘", "셋"), start=1)
            ],
        }

        def draft_extract(prompt):
            if "STYLE_SOURCE_JSON: " in prompt:
                return style_draft_response()
            return fact_draft_response(prompt)

        first = prepare_folder_draft(splits, draft_extract)
        second = prepare_folder_draft(splits, draft_extract)

        self.assertEqual(first.facts, second.facts)
        self.assertEqual(len(first.facts), 6)
        numeric = next(
            item for item in first.facts if item.source_document["path"] == "a.md"
        )
        self.assertEqual(numeric.facts[0].required_literals, ("5.3초로",))
        self.assertIn("5.3초로", numeric.facts[0].statement)
        self.assertIn("5.3초로", numeric.facts[0].evidence_spans[0])
        self.assertTrue(
            all(item.target_text == item.source_passage for item in first.facts[:3])
        )
        self.assertTrue(
            all(
                item.target_text is None
                for item in first.facts
                if item.split == "evaluation"
            )
        )
        self.assertTrue(all(item.id.startswith("folder-") for item in first.facts))

    def test_invalid_fact_drafts_are_skipped_with_stable_reasons(self):
        splits = {
            "train": [
                doc("a.md", "회의는 14:00에 시작한다. 안내 문장이 이어진다."),
                doc("b.md", "두 번째 문서는 차분히 설명한다. 맺음말이 이어진다."),
            ],
            "validation": [
                doc("v.md", "검증 문서는 별도 결론을 제시한다. 설명이 이어진다.")
            ],
            "evaluation": [
                doc(
                    f"evaluation/e{index}.md",
                    f"평가 문서 {word}는 독립된 사실을 전한다. 설명이 이어진다.",
                )
                for index, word in enumerate(("하나", "둘", "셋"), start=1)
            ],
        }
        invalid_rows = {
            "fabricated": {
                "facts": [
                    {
                        "statement": "회의는 14:00에 시작한다.",
                        "evidence_spans": ["없음"],
                    }
                ]
            },
            "incomplete": {
                "facts": [
                    {
                        "statement": "회의 시작",
                        "evidence_spans": ["회의는 14:00에 시작한다."],
                    }
                ]
            },
            "duplicate": {
                "facts": [
                    {
                        "statement": "회의는 14:00에 시작한다.",
                        "evidence_spans": ["회의는 14:00에 시작한다."],
                    },
                    {
                        "statement": "회의는 14:00에 시작한다.",
                        "evidence_spans": ["회의는 14:00에 시작한다."],
                    },
                ]
            },
            "numeric": {
                "facts": [
                    {"statement": "회의가 시작된다.", "evidence_spans": ["회의는"]}
                ]
            },
            "copy": {
                "facts": [
                    {
                        "statement": "회의는 14:00에 시작한다. 안내 문장이 이어진다.",
                        "evidence_spans": [
                            "회의는 14:00에 시작한다. 안내 문장이 이어진다."
                        ],
                    }
                ]
            },
        }
        for label, invalid in invalid_rows.items():
            with self.subTest(label=label):

                def draft_extract(prompt, invalid=invalid):
                    if "STYLE_SOURCE_JSON: " in prompt:
                        return style_draft_response()
                    passage = json.loads(prompt.rsplit("FACT_SOURCE_JSON: ", 1)[1])
                    if passage.startswith("회의는"):
                        return json.dumps(invalid, ensure_ascii=False)
                    return fact_draft_response(prompt)

                result = prepare_folder_draft(splits, draft_extract)
                self.assertFalse(
                    any(item.source_document["path"] == "a.md" for item in result.facts)
                )
                self.assertTrue(
                    any(
                        item["source_document"]["path"] == "a.md" and item["reason"]
                        for item in result.skipped
                    )
                )

    def test_fact_draft_requires_three_accepted_evaluation_cases(self):
        splits = {
            "train": [
                doc("a.md", "첫 문서는 사실을 설명한다. 맺음말이 이어진다."),
                doc("b.md", "둘째 문서는 사실을 설명한다. 맺음말이 이어진다."),
            ],
            "validation": [doc("v.md", "검증 사실을 설명한다. 맺음말이 이어진다.")],
            "evaluation": [
                doc(
                    f"evaluation/e{index}.md",
                    f"평가 {word}의 사실을 설명한다. 맺음말이 이어진다.",
                )
                for index, word in enumerate(("하나", "둘", "셋"), start=1)
            ],
        }

        def draft_extract(prompt):
            if "STYLE_SOURCE_JSON: " in prompt:
                return style_draft_response()
            passage = json.loads(prompt.rsplit("FACT_SOURCE_JSON: ", 1)[1])
            if passage.startswith("평가 셋"):
                return "not JSON"
            return fact_draft_response(prompt)

        with self.assertRaisesRegex(ValueError, "3 accepted evaluation"):
            prepare_folder_draft(splits, draft_extract)

    def test_duplicate_fact_statement_cannot_bypass_cross_split_checks(self):
        splits = {
            "train": [
                doc(
                    "a.md",
                    "Alpha evidence supports agreement. Additional context remains.",
                ),
                doc("b.md", "Second training fact is separate. More context remains."),
            ],
            "validation": [
                doc("v.md", "Validation fact is separate. More context remains.")
            ],
            "evaluation": [
                doc(
                    "evaluation/duplicate.md",
                    "Evidence one supports agreement. Evidence two confirms it. Extra context remains.",
                ),
                *[
                    doc(
                        f"evaluation/e{index}.md",
                        f"Unique evaluation {word} is separate. More context remains.",
                    )
                    for index, word in enumerate(("one", "two", "three"), start=1)
                ],
            ],
        }

        def draft_extract(prompt):
            if "STYLE_SOURCE_JSON: " in prompt:
                return style_draft_response()
            passage = json.loads(prompt.rsplit("FACT_SOURCE_JSON: ", 1)[1])
            if passage.startswith("Alpha evidence"):
                return json.dumps(
                    {
                        "facts": [
                            {
                                "statement": "The team agreed.",
                                "evidence_spans": [
                                    "Alpha evidence supports agreement."
                                ],
                            }
                        ]
                    }
                )
            if passage.startswith("Evidence one"):
                return json.dumps(
                    {
                        "facts": [
                            {
                                "statement": "The team agreed.",
                                "evidence_spans": ["Evidence one supports agreement."],
                            },
                            {
                                "statement": "The team agreed.",
                                "evidence_spans": ["Evidence two confirms it."],
                            },
                        ]
                    }
                )
            return fact_draft_response(prompt)

        result = prepare_folder_draft(splits, draft_extract)

        self.assertFalse(
            any(
                item.source_document["path"] == "evaluation/duplicate.md"
                for item in result.facts
            )
        )
        self.assertTrue(
            any(
                item["source_document"]["path"] == "evaluation/duplicate.md"
                and "duplicate" in item["reason"]
                for item in result.skipped
            )
        )

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
