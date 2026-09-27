import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

DEFAULT_MODEL_NAME = "Qwen/Qwen3-1.7B"


def select_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_base_model(
    model_name: str = DEFAULT_MODEL_NAME,
    device: torch.device | None = None,
    *,
    revision: str | None = None,
):
    if device is None:
        device = select_device()

    options = {"revision": revision} if revision is not None else {}
    tokenizer = AutoTokenizer.from_pretrained(model_name, **options)
    loaded_model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype="auto",
        **options,
    )
    loaded_model.to(device)
    return tokenizer, loaded_model
