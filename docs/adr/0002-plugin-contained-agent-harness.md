---
status: accepted
---

# Start with a plugin-contained Agent Harness

The initial Agent Harness runs inside the desktop plugin and calls a separately installed local model provider such as Ollama or llama.cpp over localhost. Fathomark will not introduce its own companion engine process initially because that would recreate installation, communication, and lifecycle complexity before profiling demonstrates a need.

Heavy work must be deferred and bounded so plugin startup and Obsidian interaction remain responsive. A companion process may be reconsidered only from measured stability or performance limits.
