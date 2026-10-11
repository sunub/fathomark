# Ollama tokenizer profile evidence

Checked 2026-09-27 against the official Ollama API documentation:

- `GET /api/tags` lists installed model names and digests: https://docs.ollama.com/api/tags
- `POST /api/show` exposes capabilities, chat template, model metadata, and tokenizer metadata: https://docs.ollama.com/api-reference/show-model-details
- `POST /api/chat` accepts native function tools and streams usage metadata: https://docs.ollama.com/api/chat
- Tool results return as `role: "tool"` with `tool_name`, following the assistant `tool_calls`: https://docs.ollama.com/capabilities/tool-calling

## Current status

No production `BudgetProfile` is registered. Fathomark can enumerate an installed model and verify that it advertises native tool calling, a context length, and a chat template, but those fields alone do not prove a safe token upper bound. Until an exact installed digest/template and byte-BPE expansion bound are reviewed and recorded, the model remains `usable: false` with a tokenizer-profile reason.

This is an implementation verification using HTTP fixtures. It is not evidence that an Ollama server, installed model, context limit, or tokenizer profile has passed on this machine.

## Measured local estimate (2026-10-11)

`createLocalCounter` no longer counts one token per UTF-8 byte. Real prompt tokens were measured on this machine as the difference in Ollama `prompt_eval_count` with and without each sample (Ollama 0.34.1, `think: false` where supported):

| Sample | gemma4:e4b | qwen3:1.7b | exaone3.5:7.8b |
|---|---|---|---|
| Korean fixture notes (3,845 B) | 0.267 | 0.309 | 0.257 |
| Korean evidence JSON (2,726 B) | 0.313 | 0.347 | 0.297 |
| English prompt source (4,241 B) | 0.253 | 0.238 | 0.274 |
| Random Hangul syllables (4,500 B) | 0.895 | 0.594 | 0.645 |
| Digit runs (3,999 B) | 1.000 | 1.000 | 1.000 |

Values are real tokens per byte. Realistic career text stayed at or below 0.35, so the estimate uses 0.5. Digit runs show bytes are still the true upper bound, so `requestView / TOKENS_PER_BYTE` must stay at or below `modelContext`: a request accepted by the estimate then fits the model context even if every byte became a token. A test pins that relation. A response schema sent as Ollama `format` did not change `prompt_eval_count` and is not counted.

This is a calibrated estimate, not a verified `BudgetProfile`; the profile list stays empty.
