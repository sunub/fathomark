---
status: accepted
---

# Make Obsidian the sole product surface

Fathomark is a desktop-only Obsidian-native product rather than an MCP server with a development CLI. The existing goals of Vault retrieval, evidence selection, context compression, and local model support remain, but external MCP compatibility and a terminal user experience are not product requirements.

The product may use modern VS Code sidebar agents as an interaction reference: active-document awareness, streaming output, visible tool activity, stop and retry, and reviewable proposed edits. This does not make VS Code a target platform. Fathomark maps those interactions to the current note, Vault retrieval, evidence provenance, insertion preview, explicit approval, and Obsidian-compatible undo.

The decision gives the agent direct access to active notes, selections, links, properties, and workspace state. It also trades away external-agent compatibility and requires Obsidian-native lifecycle, permission, and mutation boundaries.
