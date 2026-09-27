import importlib
import sys
import unittest
from unittest.mock import MagicMock, patch

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODULE_NAME = "model.training.base_model"


class BaseModelTest(unittest.TestCase):
    def import_base_model(self):
        sys.modules.pop(MODULE_NAME, None)
        return importlib.import_module(MODULE_NAME)

    def test_import_does_not_download_or_load_model(self) -> None:
        with (
            patch.object(AutoTokenizer, "from_pretrained") as load_tokenizer,
            patch.object(AutoModelForCausalLM, "from_pretrained") as load_model,
        ):
            self.import_base_model()

        load_tokenizer.assert_not_called()
        load_model.assert_not_called()

    def test_loader_returns_tokenizer_and_moves_model_to_requested_device(self) -> None:
        tokenizer = MagicMock(name="tokenizer")
        model = MagicMock(name="model")
        model.to.return_value = model
        device = torch.device("cuda")
        model_name = "Qwen/Qwen3-1.7B"

        with (
            patch.object(
                AutoTokenizer,
                "from_pretrained",
                return_value=tokenizer,
            ) as load_tokenizer,
            patch.object(
                AutoModelForCausalLM,
                "from_pretrained",
                return_value=model,
            ) as load_model,
        ):
            base_model = self.import_base_model()
            loaded_tokenizer, loaded_model = base_model.load_base_model(
                model_name,
                device,
            )

            load_tokenizer.assert_called_once_with(model_name)
            load_model.assert_called_once_with(model_name, torch_dtype="auto")

        self.assertIs(loaded_tokenizer, tokenizer)
        self.assertIs(loaded_model, model)
        model.to.assert_called_once()
        self.assertIn(
            device, model.to.call_args.args + tuple(model.to.call_args.kwargs.values())
        )


if __name__ == "__main__":
    unittest.main()


class DeviceSelectionTest(unittest.TestCase):
    def test_cpu_fallback_when_no_accelerator_is_available(self):
        from model.training.base_model import select_device

        with (
            patch("torch.cuda.is_available", return_value=False),
            patch("torch.backends.mps.is_available", return_value=False),
        ):
            self.assertEqual(select_device(), torch.device("cpu"))


class RevisionTest(unittest.TestCase):
    def test_explicit_revision_is_used_for_both_model_and_tokenizer(self):
        from model.training.base_model import load_base_model

        with (
            patch.object(AutoTokenizer, "from_pretrained") as tokenizer,
            patch.object(AutoModelForCausalLM, "from_pretrained") as model,
        ):
            load_base_model("example", torch.device("cpu"), revision="commit123")
        self.assertEqual(tokenizer.call_args.kwargs["revision"], "commit123")
        self.assertEqual(model.call_args.kwargs["revision"], "commit123")
