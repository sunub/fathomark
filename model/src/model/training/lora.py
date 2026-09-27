"""Small, dependency-free LoRA adapters for ordinary torch linear layers."""

import math
from collections.abc import Mapping, Sequence

import torch
from torch import Tensor, nn
from torch.nn import functional as F


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, rank: int = 8, alpha: float = 16.0):
        super().__init__()
        if isinstance(rank, bool) or not isinstance(rank, int) or rank <= 0:
            raise ValueError("rank must be positive and an integer")
        if not math.isfinite(alpha) or alpha <= 0:
            raise ValueError("alpha must be finite and positive")
        self.base = base
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank
        self.base.requires_grad_(False)
        self.lora_A = nn.Parameter(
            base.weight.new_empty((rank, base.in_features), dtype=torch.float32)
        )
        self.lora_B = nn.Parameter(
            base.weight.new_zeros((base.out_features, rank), dtype=torch.float32)
        )
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))

    def forward(self, inputs: Tensor) -> Tensor:
        base_output = self.base(inputs)
        delta = F.linear(
            F.linear(inputs.to(self.lora_A.dtype), self.lora_A), self.lora_B
        )
        return base_output + (delta * self.scaling).to(base_output.dtype)


def inject_lora(
    model: nn.Module,
    rank: int = 8,
    alpha: float = 16.0,
    target_modules: Sequence[str] = ("q_proj", "v_proj"),
) -> list[str]:
    """Freeze the backbone and replace matching leaf-name linear projections."""
    if any(isinstance(module, LoRALinear) for module in model.modules()):
        raise ValueError("model already contains LoRA adapters")
    targets = [
        (name, module)
        for name, module in model.named_modules()
        if name.rsplit(".", 1)[-1] in target_modules and isinstance(module, nn.Linear)
    ]
    if not targets:
        raise ValueError("no matching linear target modules found")
    # Validate first so invalid configuration never partially freezes the model.
    if isinstance(rank, bool) or not isinstance(rank, int) or rank <= 0:
        raise ValueError("rank must be positive and an integer")
    if not math.isfinite(alpha) or alpha <= 0:
        raise ValueError("alpha must be finite and positive")
    model.requires_grad_(False)
    for name, module in targets:
        parent_name, _, attribute = name.rpartition(".")
        parent = model.get_submodule(parent_name) if parent_name else model
        adapter = LoRALinear(module, rank=rank, alpha=alpha)
        adapter.train(module.training)
        setattr(parent, attribute, adapter)
    return [name for name, _ in targets]


def _adapter_parameters(model: nn.Module) -> dict[str, nn.Parameter]:
    return {
        f"{name}.{key}" if name else key: getattr(module, key)
        for name, module in model.named_modules()
        if isinstance(module, LoRALinear)
        for key in ("lora_A", "lora_B")
    }


def adapter_state_dict(model: nn.Module) -> dict[str, Tensor]:
    """Snapshot only adapter weights; CPU clones do not alias the live model."""
    return {
        name: value.detach().cpu().clone()
        for name, value in _adapter_parameters(model).items()
    }


def load_adapter_state_dict(model: nn.Module, state: Mapping[str, Tensor]) -> None:
    """Validate the entire adapter checkpoint before modifying any parameter."""
    parameters = _adapter_parameters(model)
    if not parameters or set(state) != set(parameters):
        raise ValueError("adapter checkpoint keys do not match model")
    for name, parameter in parameters.items():
        value = state[name]
        if not isinstance(value, Tensor) or value.shape != parameter.shape:
            raise ValueError(f"adapter checkpoint shape mismatch: {name}")
        if not value.is_floating_point() or not torch.isfinite(value).all():
            raise ValueError(f"invalid adapter tensor: {name}")
    with torch.no_grad():
        for name, parameter in parameters.items():
            parameter.copy_(
                state[name].to(device=parameter.device, dtype=parameter.dtype)
            )
