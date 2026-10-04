---
status: accepted
---

# Start with a plugin-contained Agent Harness

> Amended by [ADR 0007](./0007-grounded-career-writing-with-hosted-models.md): the provider behind the harness may be hosted (with the user's key and explicit consent) as well as local. The plugin-contained harness decision is unchanged.

The initial Agent Harness runs inside the desktop plugin and calls a separately installed local model provider such as Ollama or llama.cpp over localhost. Fathomark will not introduce its own companion engine process initially because that would recreate installation, communication, and lifecycle complexity before profiling demonstrates a need.

Heavy work must be deferred and bounded so plugin startup and Obsidian interaction remain responsive. A companion process may be reconsidered only from measured stability or performance limits.
