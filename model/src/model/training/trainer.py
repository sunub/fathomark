"""Small, explicit next-token LoRA trainer; no automatic adapter activation."""

import json
import math
import random
from dataclasses import asdict, dataclass
from pathlib import Path

import torch
from torch import nn

from model.training.lora import adapter_state_dict, load_adapter_state_dict


@dataclass(frozen=True)
class TokenExample:
    input_ids: list[int]
    labels: list[int]

    def __post_init__(self):
        if len(self.input_ids) < 2 or len(self.input_ids) != len(self.labels):
            raise ValueError(
                "Token examples need matching lengths of at least two tokens"
            )
        for token, label in zip(self.input_ids, self.labels):
            if type(token) is not int or token < 0:
                raise ValueError("Input token IDs must be nonnegative integers")
            if type(label) is not int or label not in (-100, token):
                raise ValueError("Labels must equal the input token or -100")
        if not any(label != -100 for label in self.labels[1:]):
            raise ValueError("Example needs at least one supervised next-token target")


def _example(chunk: list[int] | TokenExample) -> TokenExample:
    if isinstance(chunk, TokenExample):
        # Revalidate because frozen dataclasses may still contain mutable lists.
        chunk.__post_init__()
        return chunk
    return TokenExample(chunk, chunk)


def _target_count(chunk: list[int] | TokenExample) -> int:
    return sum(label != -100 for label in _example(chunk).labels[1:])


@dataclass(frozen=True)
class TrainConfig:
    epochs: int = 1
    learning_rate: float = 1e-4
    accumulation_steps: int = 4
    max_grad_norm: float = 1.0
    seed: int = 42

    def __post_init__(self):
        for name in ("epochs", "accumulation_steps"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{name} must be a positive integer")
        for name in ("learning_rate", "max_grad_norm"):
            value = getattr(self, name)
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive")


def _loss(model, chunk, device):
    example = _example(chunk)
    ids = torch.tensor([example.input_ids], dtype=torch.long, device=device)
    labels = torch.tensor([example.labels], dtype=torch.long, device=device)
    loss = model(
        input_ids=ids,
        attention_mask=torch.ones_like(ids),
        labels=labels,
        use_cache=False,
    ).loss
    if loss is None or not torch.isfinite(loss).item():
        raise ValueError("Non-finite loss; candidate was not saved")
    return loss


def evaluate_loss(model, chunks):
    """Token-weighted next-token loss; this is not a style or safety score."""
    device = next(model.parameters()).device
    was_training = model.training
    model.eval()
    try:
        with torch.inference_mode():
            if not chunks:
                raise ValueError("Evaluation needs nonempty token examples")
            count = sum(_target_count(chunk) for chunk in chunks)
            return (
                sum(
                    _loss(model, chunk, device).item() * _target_count(chunk)
                    for chunk in chunks
                )
                / count
            )
    finally:
        model.train(was_training)


def fit(
    model: nn.Module,
    train_chunks: list[list[int] | TokenExample],
    validation_chunks: list[list[int] | TokenExample],
    config: TrainConfig,
    *,
    select_best: bool = False,
) -> dict:
    for name, chunks in [("training", train_chunks), ("validation", validation_chunks)]:
        if not chunks:
            raise ValueError(f"{name} needs nonempty chunks of at least two tokens")
        for chunk in chunks:
            _example(chunk)
    parameters = [p for p in model.parameters() if p.requires_grad]
    if not parameters:
        raise ValueError("No trainable adapter parameters")
    device = next(model.parameters()).device
    optimizer = torch.optim.AdamW(parameters, lr=config.learning_rate)
    rng = random.Random(config.seed)
    torch.manual_seed(config.seed)
    initial = evaluate_loss(model, validation_chunks)
    best_loss = initial
    best_epoch = 0
    best_state = adapter_state_dict(model) if select_best else None
    history = []
    steps = 0
    for epoch in range(config.epochs):
        order = list(range(len(train_chunks)))
        rng.shuffle(order)
        model.train()
        total_loss = 0.0
        total_tokens = 0
        for start in range(0, len(order), config.accumulation_steps):
            group = [
                train_chunks[i]
                for i in order[start : start + config.accumulation_steps]
            ]
            token_count = sum(_target_count(chunk) for chunk in group)
            optimizer.zero_grad(set_to_none=True)
            for chunk in group:
                loss = _loss(model, chunk, device)
                tokens = _target_count(chunk)
                (loss * (tokens / token_count)).backward()
                total_loss += loss.item() * tokens
                total_tokens += tokens
            torch.nn.utils.clip_grad_norm_(
                parameters, config.max_grad_norm, error_if_nonfinite=True
            )
            optimizer.step()
            steps += 1
        row = {
            "epoch": epoch + 1,
            "train_loss": total_loss / total_tokens,
            "validation_loss": evaluate_loss(model, validation_chunks),
        }
        history.append(row)
        if row["validation_loss"] < best_loss:
            best_loss = row["validation_loss"]
            best_epoch = epoch + 1
            if select_best:
                best_state = adapter_state_dict(model)
        print(json.dumps(row), flush=True)
    if select_best:
        load_adapter_state_dict(model, best_state)
    return {
        "validation_loss_before": initial,
        "validation_loss_after": best_loss
        if select_best
        else history[-1]["validation_loss"],
        "selected_epoch": best_epoch if select_best else config.epochs,
        "best_validation_loss": best_loss,
        "optimizer_steps": steps,
        "history": history,
        "training": asdict(config),
    }


def save_candidate(
    output: Path, model: nn.Module, metadata: dict, metrics: dict, *, tokenizer=None
):
    """Refuse overwrites; metadata is written last as the completion marker."""
    objective = metadata.get("objective", "document_continuation")
    if objective not in ("document_continuation", "supervised_response"):
        raise ValueError("Unsupported training objective")
    state = adapter_state_dict(model)
    if not state or any(not torch.isfinite(t).all().item() for t in state.values()):
        raise ValueError("Adapter is empty or non-finite")
    metrics_json = json.dumps(metrics, indent=2, allow_nan=False) + "\n"
    output.mkdir(parents=True, exist_ok=False)
    torch.save(state, output / "adapter.pt")
    if tokenizer is not None:
        tokenizer.save_pretrained(output / "tokenizer")
    (output / "metrics.json").write_text(metrics_json)
    payload = {
        **metadata,
        "format_version": 1,
        "status": "candidate",
        "objective": objective,
    }
    (output / "adapter.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def read_candidate(folder: Path):
    metadata = json.loads((folder / "adapter.json").read_text(encoding="utf-8"))
    if metadata.get("format_version") != 1 or metadata.get("status") != "candidate":
        raise ValueError("Unsupported candidate format")
    state = torch.load(folder / "adapter.pt", map_location="cpu", weights_only=True)
    if (
        not isinstance(state, dict)
        or not state
        or any(
            not isinstance(t, torch.Tensor) or not torch.isfinite(t).all().item()
            for t in state.values()
        )
    ):
        raise ValueError("Invalid adapter state")
    return metadata, state
