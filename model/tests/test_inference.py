import unittest
from unittest.mock import MagicMock

import torch

from model.training.inference import generate_text


class FakeBatch(dict[str, torch.Tensor]):
    def __init__(self, **values: torch.Tensor) -> None:
        super().__init__(values)
        self.device: torch.device | None = None

    def to(self, device: torch.device) -> "FakeBatch":
        self.device = device
        self["input_ids"] = self["input_ids"].to(device)
        return self


class GenerateTextTest(unittest.TestCase):
    def test_generates_only_the_completion_from_qwen_chat_prompt(self) -> None:
        model = MagicMock(name="model")
        model_parameter = torch.nn.Parameter(torch.zeros(1))
        model.parameters.return_value = iter([model_parameter])
        encoded_ids = torch.tensor([[11, 12]])
        generated_ids = torch.tensor([[11, 12, 21, 22]])
        grad_states: list[bool] = []

        def generate(**kwargs: object) -> torch.Tensor:
            grad_states.append(torch.is_grad_enabled())
            return generated_ids

        model.generate.side_effect = generate

        tokenizer = MagicMock(name="tokenizer")
        tokenizer.apply_chat_template.return_value = "serialized Qwen prompt"
        batch = FakeBatch(input_ids=encoded_ids)
        tokenizer.return_value = batch
        tokenizer.decode.return_value = "정리된 답변"

        result = generate_text(
            model,
            tokenizer,
            "이 문장을 차분하게 정리해 줘.",
            max_new_tokens=24,
        )

        tokenizer.apply_chat_template.assert_called_once_with(
            [{"role": "user", "content": "이 문장을 차분하게 정리해 줘."}],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
        tokenizer.assert_called_once_with("serialized Qwen prompt", return_tensors="pt")
        self.assertEqual(batch.device, model_parameter.device)
        self.assertEqual(model.generate.call_args.kwargs["max_new_tokens"], 24)
        torch.testing.assert_close(
            model.generate.call_args.kwargs["input_ids"],
            encoded_ids,
        )
        self.assertEqual(grad_states, [False])
        torch.testing.assert_close(
            tokenizer.decode.call_args.args[0],
            torch.tensor([21, 22]),
        )
        self.assertEqual(
            tokenizer.decode.call_args.kwargs, {"skip_special_tokens": True}
        )
        self.assertEqual(result, "정리된 답변")


if __name__ == "__main__":
    unittest.main()


class GenerationModeTest(unittest.TestCase):
    def test_restores_training_mode_even_if_generation_fails(self):
        class FailingModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.weight = torch.nn.Parameter(torch.zeros(1))

            def generate(self, **kwargs):
                assert not self.training
                assert torch.is_inference_mode_enabled()
                assert kwargs["do_sample"] is False
                raise RuntimeError("generation failed")

        model = FailingModel()
        tokenizer = MagicMock()
        tokenizer.return_value = FakeBatch(input_ids=torch.tensor([[1]]))
        with self.assertRaisesRegex(RuntimeError, "generation failed"):
            generate_text(model, tokenizer, "hello")
        self.assertTrue(model.training)
