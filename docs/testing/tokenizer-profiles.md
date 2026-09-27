# Ollama tokenizer profile evidence

Checked 2026-09-27 against the official Ollama API documentation:

- `GET /api/tags` lists installed model names and digests: https://docs.ollama.com/api/tags
- `POST /api/show` exposes capabilities, chat template, model metadata, and tokenizer metadata: https://docs.ollama.com/api-reference/show-model-details
- `POST /api/chat` accepts native function tools and streams usage metadata: https://docs.ollama.com/api/chat
- Tool results return as `role: "tool"` with `tool_name`, following the assistant `tool_calls`: https://docs.ollama.com/capabilities/tool-calling

## Current status

No production `BudgetProfile` is registered. Fathomark can enumerate an installed model and verify that it advertises native tool calling, a context length, and a chat template, but those fields alone do not prove a safe token upper bound. Until an exact installed digest/template and byte-BPE expansion bound are reviewed and recorded, the model remains `usable: false` with a tokenizer-profile reason.

This is an implementation verification using HTTP fixtures. It is not evidence that an Ollama server, installed model, context limit, or tokenizer profile has passed on this machine.
