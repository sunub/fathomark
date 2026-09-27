import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import torch
from transformers import Qwen3Config, Qwen3ForCausalLM

from model.training.lora import adapter_state_dict, inject_lora, load_adapter_state_dict
from model.training.trainer import (
    TokenExample,
    TrainConfig,
    evaluate_loss,
    fit,
    read_candidate,
    save_candidate,
)


def tiny_model():
    torch.manual_seed(17)
    return Qwen3ForCausalLM(
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
    )


class TrainerTest(unittest.TestCase):
    def test_masked_loss_ignores_prompt_targets_and_weights_response_tokens(self):
        model = tiny_model().eval()
        examples = [
            TokenExample([1, 2, 3, 4], [-100, -100, -100, 4]),
            TokenExample([5, 6, 7, 8], [-100, -100, 7, 8]),
        ]
        with torch.no_grad():
            first = model(torch.tensor([[1, 2, 3, 4]])).logits
            second = model(torch.tensor([[5, 6, 7, 8]])).logits
            expected = torch.nn.functional.cross_entropy(
                torch.cat([first[0, 2:3], second[0, 1:3]]),
                torch.tensor([4, 7, 8]),
            ).item()
        self.assertAlmostEqual(evaluate_loss(model, examples), expected, places=6)

    def test_invalid_supervised_examples_rejected(self):
        for ids, labels in [
            ([1, 2], [-100]),
            ([1], [1]),
            ([1, -2], [-100, -2]),
            ([1, 2], [-100, 3]),
            ([1, 2], [1, -100]),
            ([True, 2], [-100, 2]),
            ([1, 2], [-100, 2.0]),
        ]:
            with self.subTest(ids=ids, labels=labels), self.assertRaises(ValueError):
                TokenExample(ids, labels)

    def test_accumulation_weights_only_response_targets(self):
        model = tiny_model()
        inject_lora(model, rank=2)
        manual = tiny_model()
        inject_lora(manual, rank=2)
        examples = [
            TokenExample([1, 2, 3, 4], [-100, -100, -100, 4]),
            TokenExample([5, 6, 7, 8], [-100, -100, 7, 8]),
        ]
        parameters = [p for p in manual.parameters() if p.requires_grad]
        optimizer = torch.optim.AdamW(parameters, lr=0.01)
        manual.train()
        logits_a = manual(torch.tensor([[1, 2, 3, 4]])).logits
        logits_b = manual(torch.tensor([[5, 6, 7, 8]])).logits
        torch.nn.functional.cross_entropy(
            torch.cat([logits_a[0, 2:3], logits_b[0, 1:3]]),
            torch.tensor([4, 7, 8]),
        ).backward()
        torch.nn.utils.clip_grad_norm_(parameters, 1.0)
        optimizer.step()
        fit(
            model,
            examples,
            examples,
            TrainConfig(learning_rate=0.01, accumulation_steps=2),
        )
        expected = adapter_state_dict(manual)
        for name, value in adapter_state_dict(model).items():
            torch.testing.assert_close(value, expected[name], rtol=1e-5, atol=1e-7)

    def test_nonfinite_loss_and_candidate_are_rejected(self):
        model = tiny_model()
        inject_lora(model)
        with torch.no_grad():
            next(p for p in model.parameters() if p.requires_grad).fill_(float("nan"))
        with self.assertRaises((ValueError, RuntimeError)):
            fit(model, [[1, 2]], [[1, 2]], TrainConfig(), select_best=True)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "candidate"
            with self.assertRaises(ValueError):
                save_candidate(out, model, {}, {})
            self.assertFalse(out.exists())

    def test_best_selection_restores_initial_or_best_epoch(self):
        for losses, selected in [([1.0, 2.0, 3.0], 0), ([3.0, 1.0, 2.0], 1)]:
            with self.subTest(losses=losses):
                model = tiny_model()
                inject_lora(model, rank=2)
                snapshots = []

                def validation(*args, snapshots=snapshots, model=model, losses=losses):
                    snapshots.append(adapter_state_dict(model))
                    return losses[len(snapshots) - 1]

                with patch(
                    "model.training.trainer.evaluate_loss", side_effect=validation
                ):
                    metrics = fit(
                        model,
                        [[1, 2, 3]],
                        [[1, 2, 3]],
                        TrainConfig(epochs=2, learning_rate=0.01),
                        select_best=True,
                    )
                self.assertEqual(metrics["selected_epoch"], selected)
                self.assertEqual(metrics["validation_loss_after"], min(losses))
                self.assertEqual(metrics["best_validation_loss"], min(losses))
                for name, value in adapter_state_dict(model).items():
                    torch.testing.assert_close(
                        value, snapshots[selected][name], rtol=0, atol=0
                    )

    def test_supervised_training_improves_response_loss_with_frozen_base(self):
        model = tiny_model()
        inject_lora(model, rank=2, alpha=4.0)
        frozen = {
            n: p.detach().clone()
            for n, p in model.named_parameters()
            if not p.requires_grad
        }
        example = TokenExample([1, 2, 3, 4], [-100, -100, 3, 4])
        metrics = fit(
            model,
            [example],
            [example],
            TrainConfig(epochs=4, learning_rate=0.03),
            select_best=True,
        )
        self.assertLess(
            metrics["validation_loss_after"], metrics["validation_loss_before"]
        )
        for name, parameter in model.named_parameters():
            if name in frozen:
                torch.testing.assert_close(parameter, frozen[name], rtol=0, atol=0)

    def test_candidate_preserves_supervised_objective_and_rejects_unknown(self):
        model = tiny_model()
        inject_lora(model)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "supervised"
            save_candidate(out, model, {"objective": "supervised_response"}, {})
            metadata, _ = read_candidate(out)
            self.assertEqual(metadata["objective"], "supervised_response")
            with self.assertRaises(ValueError):
                save_candidate(
                    Path(tmp) / "unknown", model, {"objective": "unknown"}, {}
                )

    def test_tokenizer_save_failure_does_not_mark_candidate_complete(self):
        from unittest.mock import Mock

        model = tiny_model()
        inject_lora(model)
        tokenizer = Mock()
        tokenizer.save_pretrained.side_effect = OSError("disk full")
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "candidate"
            with self.assertRaises(OSError):
                save_candidate(output, model, {}, {}, tokenizer=tokenizer)
            self.assertFalse((output / "adapter.json").exists())

    def test_real_qwen_training_changes_only_adapter_and_roundtrips(self):
        model = tiny_model()
        names = inject_lora(model, rank=2, alpha=4.0)
        frozen = {
            n: p.detach().clone()
            for n, p in model.named_parameters()
            if not p.requires_grad
        }
        before = adapter_state_dict(model)
        config = TrainConfig(epochs=2, learning_rate=0.01, accumulation_steps=2)
        metrics = fit(model, [[1, 2, 3, 4], [2, 3, 4], [1, 3, 5]], [[1, 2, 4]], config)
        self.assertEqual(metrics["optimizer_steps"], 4)
        self.assertTrue(math.isfinite(metrics["validation_loss_after"]))
        self.assertTrue(
            any(
                not torch.equal(before[n], p)
                for n, p in adapter_state_dict(model).items()
            )
        )
        for n, p in model.named_parameters():
            if n in frozen:
                torch.testing.assert_close(p, frozen[n], rtol=0, atol=0)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "candidate"
            save_candidate(
                out,
                model,
                {
                    "base_model": "tiny",
                    "rank": 2,
                    "alpha": 4.0,
                    "target_modules": ["q_proj", "v_proj"],
                    "module_names": names,
                },
                metrics,
            )
            metadata, state = read_candidate(out)
            self.assertEqual(metadata["status"], "candidate")
            clone = tiny_model()
            inject_lora(clone, rank=2, alpha=4.0)
            load_adapter_state_dict(clone, state)
            model.eval()
            clone.eval()
            ids = torch.tensor([[1, 2, 3]])
            with torch.no_grad():
                torch.testing.assert_close(model(ids).logits, clone(ids).logits)
            with self.assertRaises(FileExistsError):
                save_candidate(out, model, {}, {})

    def test_invalid_config_and_empty_inputs_fail(self):
        for kwargs in (
            {"epochs": 0},
            {"learning_rate": float("nan")},
            {"accumulation_steps": 0},
            {"max_grad_norm": -1},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                TrainConfig(**kwargs)
        with self.assertRaises(ValueError):
            fit(tiny_model(), [], [[1, 2]], TrainConfig())

    def test_untrained_model_and_single_token_rejected(self):
        model = tiny_model()
        with self.assertRaises(ValueError):
            fit(model, [[1]], [[1, 2]], TrainConfig())


if __name__ == "__main__":
    unittest.main()
