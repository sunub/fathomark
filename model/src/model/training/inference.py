"""Generate a deterministic completion using the model's chat template."""

import torch


def generate_text(model, tokenizer, prompt: str, max_new_tokens: int = 256) -> str:
    if max_new_tokens <= 0:
        raise ValueError("max_new_tokens must be positive")
    serialized = tokenizer.apply_chat_template(
        [{"role": "user", "content": prompt}],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )
    batch = tokenizer(serialized, return_tensors="pt").to(
        next(model.parameters()).device
    )
    was_training = model.training
    model.eval()
    try:
        with torch.inference_mode():
            generated = model.generate(
                **batch, max_new_tokens=max_new_tokens, do_sample=False
            )
        completion = generated[0, batch["input_ids"].shape[-1] :]
        return tokenizer.decode(completion, skip_special_tokens=True)
    finally:
        model.train(was_training)
