---
status: accepted
---

# Build the workflow and agent loop without LangChain or LangGraph

> Recorded on 2026-10-12, after the fact. The decision was made in practice while the career-writing workflow was implemented; the S0 plan that was meant to record it never produced this ADR.

## Context

The architecture documents assumed LangChain would supply the agent loop (`createAgent`, middleware) and that LangGraph might later supply the fixed-step workflow graph. The S0 plan was to measure both inside the real plugin bundle before deciding.

Measurements on 2026-10-05 ([open-questions-bundle.md](../research/open-questions-bundle.md), [langchain-stack-fit.md](../research/langchain-stack-fit.md)):

- `main.js` was 306 KB against the 900 KB budget in `plugin/build.mjs`.
- A three-node LangGraph `StateGraph` with interrupt and `MemorySaver` raised it to 1,412 KB (+1,106 KB). `createAgent` alone raised it to 1,476 KB (+1,170 KB). Both fail the budget, and esbuild's `cjs` output cannot code-split them out of startup.
- `@langchain/core`'s `withStructuredOutput` throws without `bindTools`, so tool-less structured calls would still need a product-owned path.
- Deep Agents adds about 1.8 MB, requires zod 4, and cannot exclude its file-writing tools.

ADR 0007 had already chosen a fixed-step workflow over an open agent loop, which removes most of what `createAgent` offers.

## Decision

Fathomark does not depend on LangChain, LangGraph, or Deep Agents.

- The fixed-step career workflow is a product-owned state machine in `plugin/src/workflow/career-graph.ts`.
- The bounded tool loop for exploration is product-owned in `plugin/src/harness/agent-loop.ts`.
- Structured model calls go through `plugin/src/providers/structured.ts`, validated with zod.
- The dependency-cruiser rule `langchain-stays-in-the-harness` stays as a tripwire: if a framework is ever admitted, it is confined to the harness.

## Consequences

- The run state, approval waits, resume, budgets, and tool policy are code Fathomark maintains and tests itself.
- There is no framework checkpointing. Runs resume only within one plugin session.
- The bundle stays within budget without the frameworks, but it has grown for other reasons: about 826 KB of the 900 KB budget on 2026-10-12. The next sizeable dependency needs a budget decision.
- Reconsider only if resumable multi-session runs become a product requirement and a framework fits the budget or can be loaded lazily.
