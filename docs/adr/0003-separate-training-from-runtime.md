---
status: superseded
---

# Separate model training from the plugin runtime

The Obsidian product runtime should remain TypeScript-only, while optional LoRA dataset preparation, training, evaluation, and export live in a separate Python/PyTorch workspace. This keeps plugin installation lightweight and prevents training dependencies from becoming user requirements while preserving a path to task-specific model adaptation.

The proposal should be accepted only after the first LoRA behavior objective and its evaluation dataset are defined. Vault knowledge itself remains the responsibility of retrieval rather than model training.

Superseded by [ADR 0007](./0007-grounded-career-writing-with-hosted-models.md): LoRA training is removed from the product path, so no training workspace needs to be separated from the runtime. The `model/` directory is kept only as a record of the evaluation experiments.
