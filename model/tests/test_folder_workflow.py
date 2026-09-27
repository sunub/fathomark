import contextlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from model.training.cli import main


class FolderWorkflowTest(unittest.TestCase):
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
