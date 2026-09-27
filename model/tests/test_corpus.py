import hashlib
import tempfile
import unittest
from pathlib import Path

from model.training.corpus import (
    Document,
    load_documents,
    split_documents,
    token_chunks,
)


def document(path, text):
    return Document(path, text, hashlib.sha256(text.encode("utf-8")).hexdigest())


class CorpusTest(unittest.TestCase):
    def test_load_respects_selected_folder_and_normalizes_deduplicates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / "selected"
            folder.mkdir()
            (root / "outside.md").write_text("outside", encoding="utf-8")
            (folder / "a.MD").write_bytes(b"  first\r\nsecond  ")
            (folder / "duplicate.txt").write_text("first\nsecond", encoding="utf-8")
            (folder / "blank.md").write_text(" \n ", encoding="utf-8")
            (folder / "ignored.json").write_text("ignored", encoding="utf-8")
            (folder / ".hidden.md").write_text("hidden", encoding="utf-8")
            hidden = folder / ".hidden"
            hidden.mkdir()
            (hidden / "note.md").write_text("hidden dir", encoding="utf-8")
            nested = folder / "nested"
            nested.mkdir()
            (nested / "b.TXT").write_text("third", encoding="utf-8")
            (folder / "link.md").symlink_to(root / "outside.md")
            (folder / "link-dir").symlink_to(root, target_is_directory=True)
            self.assertEqual(
                load_documents(folder),
                [document("a.MD", "first\nsecond"), document("nested/b.TXT", "third")],
            )

    def test_invalid_folder_and_invalid_utf8_explain_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            with self.assertRaisesRegex(ValueError, "folder"):
                load_documents(folder / "missing")
            bad = folder / "bad.md"
            bad.write_bytes(b"\xff")
            with self.assertRaisesRegex(ValueError, "bad.md"):
                load_documents(folder)
            with self.assertRaisesRegex(ValueError, "folder"):
                load_documents(bad)

    def test_symlink_root_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / "actual"
            folder.mkdir()
            alias = root / "alias"
            alias.symlink_to(folder, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "folder"):
                load_documents(alias)

    def test_split_is_reproducible_order_independent_and_disjoint(self):
        documents = [document(f"{index}.md", str(index)) for index in range(10)]
        original = list(documents)
        train, validation = split_documents(documents, seed=23)
        self.assertEqual(documents, original)
        self.assertEqual(
            (train, validation), split_documents(list(reversed(documents)), seed=23)
        )
        self.assertEqual(len(validation), 2)
        self.assertEqual(set(train) | set(validation), set(documents))
        self.assertFalse(set(train) & set(validation))
        self.assertNotEqual((train, validation), split_documents(documents, seed=24))

    def test_split_requires_distinct_documents_and_nonempty_partitions(self):
        first = document("a.md", "one")
        second = document("b.md", "two")
        for documents in ([], [first], [first, document("duplicate.md", "one")]):
            with self.assertRaises(ValueError):
                split_documents(documents)
        for fraction in (0, 1, -0.1, 1.1, float("nan")):
            with self.assertRaises(ValueError):
                split_documents([first, second], fraction)
        for fraction in (0.001, 0.999):
            train, validation = split_documents([first, second], fraction)
            self.assertEqual((len(train), len(validation)), (1, 1))

    def test_chunks_preserve_transitions_without_crossing_documents(self):
        class Tokenizer:
            eos_token_id = 99

            def encode(self, text, *, add_special_tokens):
                self.assert_no_special_tokens = not add_special_tokens
                return [int(token) for token in text.split()]

        tokenizer = Tokenizer()
        chunks = token_chunks(
            [document("a", "1 2 3 4 5 6"), document("b", "7 8")],
            tokenizer,
            max_length=4,
        )
        self.assertTrue(tokenizer.assert_no_special_tokens)
        self.assertEqual(chunks, [[1, 2, 3, 4], [4, 5, 6, 99], [7, 8, 99]])
        self.assertEqual(token_chunks([document("a", "")], tokenizer), [])

    def test_chunks_require_eos_and_at_least_two_tokens(self):
        class Tokenizer:
            eos_token_id = None

        with self.assertRaisesRegex(ValueError, "EOS"):
            token_chunks([], Tokenizer())
        with self.assertRaisesRegex(ValueError, "max_length"):
            token_chunks([], Tokenizer(), max_length=1)


if __name__ == "__main__":
    unittest.main()
