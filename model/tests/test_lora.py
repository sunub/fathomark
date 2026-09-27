import unittest

import torch
from torch import nn
from torch.nn import functional as F

from model.training.lora import LoRALinear


class LoRALinearTest(unittest.TestCase):
    def setUp(self) -> None:
        torch.manual_seed(7)
        self.base = nn.Linear(3, 2)
        self.inputs = torch.tensor([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])

    def test_initial_output_matches_base_layer(self) -> None:
        layer = LoRALinear(self.base, rank=2, alpha=4.0)

        torch.testing.assert_close(layer(self.inputs), self.base(self.inputs))

    def test_base_layer_parameters_are_frozen_and_adapter_is_trainable(self) -> None:
        layer = LoRALinear(self.base, rank=2, alpha=4.0)

        self.assertTrue(
            all(not parameter.requires_grad for parameter in self.base.parameters())
        )
        self.assertTrue(
            any(parameter.requires_grad for parameter in layer.parameters())
        )

    def test_optimizer_updates_adapter_without_changing_base_layer(self) -> None:
        layer = LoRALinear(self.base, rank=2, alpha=4.0)
        base_before = {
            name: parameter.detach().clone()
            for name, parameter in self.base.named_parameters()
        }
        adapter_parameters = [
            parameter for parameter in layer.parameters() if parameter.requires_grad
        ]
        adapter_before = [
            parameter.detach().clone() for parameter in adapter_parameters
        ]
        optimizer = torch.optim.SGD(adapter_parameters, lr=0.1)
        targets = torch.ones_like(layer(self.inputs))

        for _ in range(3):
            optimizer.zero_grad()
            loss = F.mse_loss(layer(self.inputs), targets)
            loss.backward()
            optimizer.step()

        self.assertTrue(
            any(
                not torch.equal(before, after)
                for before, after in zip(adapter_before, adapter_parameters)
            )
        )
        for name, parameter in self.base.named_parameters():
            self.assertTrue(torch.equal(base_before[name], parameter))

    def test_rank_must_be_positive(self) -> None:
        for rank in (0, -1):
            with (
                self.subTest(rank=rank),
                self.assertRaisesRegex(ValueError, "rank must be positive"),
            ):
                LoRALinear(self.base, rank=rank, alpha=4.0)


if __name__ == "__main__":
    unittest.main()


class AdapterIntegrationTest(unittest.TestCase):
    def make_model(self):
        torch.manual_seed(4)
        return nn.Sequential(
            nn.ModuleDict(
                {
                    "q_proj": nn.Linear(3, 3),
                    "v_proj": nn.Linear(3, 3),
                    "head": nn.Linear(3, 2),
                }
            )
        )

    def test_injection_freezes_full_base_and_roundtrip_restores_predictions(self):
        from model.training.lora import (
            adapter_state_dict,
            inject_lora,
            load_adapter_state_dict,
        )

        model = self.make_model()
        names = inject_lora(model, rank=2, alpha=4)
        self.assertEqual(names, ["0.q_proj", "0.v_proj"])
        for name, parameter in model.named_parameters():
            self.assertEqual(
                parameter.requires_grad, name.endswith(("lora_A", "lora_B"))
            )
        with torch.no_grad():
            model[0]["q_proj"].lora_B.fill_(0.5)
        state = adapter_state_dict(model)
        clone = self.make_model()
        inject_lora(clone, rank=2, alpha=4)
        load_adapter_state_dict(clone, state)
        inputs = torch.ones(2, 3)
        torch.testing.assert_close(
            model[0]["q_proj"](inputs), clone[0]["q_proj"](inputs)
        )
        self.assertTrue(all(t.device.type == "cpu" for t in state.values()))
        with torch.no_grad():
            model[0]["q_proj"].lora_B.zero_()
        self.assertTrue(torch.all(state["0.q_proj.lora_B"] == 0.5))

    def test_invalid_state_is_rejected_before_any_parameter_changes(self):
        from model.training.lora import (
            adapter_state_dict,
            inject_lora,
            load_adapter_state_dict,
        )

        model = self.make_model()
        inject_lora(model, rank=2)
        original = adapter_state_dict(model)
        bad = {name: value + 1 for name, value in original.items()}
        bad["0.v_proj.lora_B"] = torch.ones(99)
        with self.assertRaises(ValueError):
            load_adapter_state_dict(model, bad)
        for name, value in adapter_state_dict(model).items():
            torch.testing.assert_close(value, original[name])
        with self.assertRaises(ValueError):
            load_adapter_state_dict(model, {})

    def test_no_matches_and_double_injection_fail_without_mutating(self):
        from model.training.lora import inject_lora

        model = self.make_model()
        with self.assertRaises(ValueError):
            inject_lora(model, target_modules=("missing",))
        self.assertTrue(all(p.requires_grad for p in model.parameters()))
        inject_lora(model)
        with self.assertRaises(ValueError):
            inject_lora(model)


class MixedPrecisionTest(unittest.TestCase):
    def test_adapter_updates_use_float32_with_bfloat16_base(self):
        base = nn.Linear(3, 2, dtype=torch.bfloat16)
        layer = LoRALinear(base, rank=2, alpha=4)
        self.assertEqual(layer.lora_A.dtype, torch.float32)
        self.assertEqual(layer.lora_B.dtype, torch.float32)
        inputs = torch.ones(2, 3, dtype=torch.bfloat16)
        result = layer(inputs)
        self.assertEqual(result.dtype, torch.bfloat16)
        result.float().sum().backward()
        self.assertEqual(layer.lora_B.grad.dtype, torch.float32)
