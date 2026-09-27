import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from model.training.cli import main


class TrainingCliTest(unittest.TestCase):
    def test_input_symlink_is_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "texts"
            root.mkdir()
            link = Path(tmp) / "link"
            link.symlink_to(root, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "non-symlink"):
                main(["train", "--input-dir", str(link), "--dry-run"])

    def test_local_model_train_save_and_generate_end_to_end(self):
        from tokenizers import Tokenizer
        from tokenizers.models import WordLevel
        from tokenizers.pre_tokenizers import Whitespace
        from transformers import PreTrainedTokenizerFast, Qwen3Config, Qwen3ForCausalLM

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "texts"
            root.mkdir()
            for index, text in enumerate(
                ("one two three", "two three one", "three one two")
            ):
                (root / f"{index}.txt").write_text(text)
            base = Path(tmp) / "base"
            Qwen3ForCausalLM(
                Qwen3Config(
                    vocab_size=32,
                    hidden_size=16,
                    intermediate_size=32,
                    num_hidden_layers=1,
                    num_attention_heads=2,
                    num_key_value_heads=1,
                    head_dim=8,
                    max_position_embeddings=64,
                )
            ).save_pretrained(base)
            raw = Tokenizer(
                WordLevel(
                    {"[UNK]": 0, "[EOS]": 1, "one": 2, "two": 3, "three": 4},
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
                "{% for message in messages %}{{ message['content'] }}{% endfor %}"
            )
            tokenizer.save_pretrained(base)
            candidate = Path(tmp) / "candidate"
            with contextlib.redirect_stdout(io.StringIO()):
                main(
                    [
                        "train",
                        "--input-dir",
                        str(root),
                        "--output-dir",
                        str(candidate),
                        "--model",
                        str(base),
                        "--device",
                        "cpu",
                        "--rank",
                        "2",
                        "--max-length",
                        "8",
                    ]
                )
                main(
                    [
                        "generate",
                        "--adapter-dir",
                        str(candidate),
                        "--request",
                        "one two",
                        "--device",
                        "cpu",
                        "--max-new-tokens",
                        "2",
                    ]
                )
                main(
                    [
                        "generate",
                        "--adapter-dir",
                        str(candidate),
                        "--request",
                        "one two",
                        "--device",
                        "cpu",
                        "--max-new-tokens",
                        "2",
                        "--baseline",
                    ]
                )
            self.assertTrue((candidate / "tokenizer" / "tokenizer.json").is_file())
            metadata = json.loads((candidate / "adapter.json").read_text())
            self.assertEqual(len(metadata["documents"]["validation"]), 1)

    def test_dry_run_uses_only_selected_folder_without_model_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "texts"
            root.mkdir()
            (root / "a.md").write_text("첫 번째 글입니다.", encoding="utf-8")
            (root / "b.txt").write_text("두 번째 글입니다.", encoding="utf-8")
            output = io.StringIO()
            with (
                patch("model.training.cli.load_base_model") as loader,
                contextlib.redirect_stdout(output),
            ):
                main(["train", "--input-dir", str(root), "--dry-run"])
            loader.assert_not_called()
            report = json.loads(output.getvalue())
            self.assertEqual(report["train_documents"], 1)
            self.assertEqual(report["validation_documents"], 1)
            self.assertNotIn("첫 번째", output.getvalue())

    def test_output_inside_input_or_existing_is_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "texts"
            root.mkdir()
            (root / "a.txt").write_text("one")
            (root / "b.txt").write_text("two")
            for output in (root / "run", Path(tmp)):
                with (
                    self.subTest(output=output),
                    patch("model.training.cli.load_base_model") as loader,
                ):
                    with self.assertRaises(ValueError):
                        main(
                            [
                                "train",
                                "--input-dir",
                                str(root),
                                "--output-dir",
                                str(output),
                            ]
                        )
                    loader.assert_not_called()


if __name__ == "__main__":
    unittest.main()
