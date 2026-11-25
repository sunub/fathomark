# Fathomark

**Grounded intelligence for your notes.**

- **Design System Storybook (Live):** https://sunub.github.io/fathomark/

Fathomark is a desktop-only AI workspace for Obsidian. Its first experience, **Vault Chat**, brings the visible, tool-using sidebar workflow familiar from modern editor agents into Obsidian: it uses the current note and selected evidence to produce source-grounded answers and proposes note changes for explicit user approval. Its first job is career writing: turning a job posting or application question into resume bullets and essay answers that cite your own notes and read like your own writing.

## Status

The career-writing workflow runs end to end on a local Ollama model (`gemma4:e4b` by default): request analysis, hybrid Vault retrieval, a readiness check, outline, draft, claim-by-claim verification, preview, and insertion after approval. Known problems and the next steps are in [DIRECTION.md](./docs/DIRECTION.md). Writing with the user's Codex CLI is proposed but not implemented ([ADR 0010](docs/adr/0010-local-curation-codex-drafting.md)).

## Verified metrics & quality gates

Every number below states its exact measurement environment. Real-vault pass criteria have only been completed for retrieval; workflow completion and build/a11y checks are synthetic or local verification results, not production telemetry.

| Area | Verified result | Measurement scope | Source |
|---|---|---|---|
| Hybrid retrieval | recall@3 **0.85** (34/40), no-evidence block **0.95** (19/20), false block **0.00** (0/40), non-experience top-1 **0.03** (1/40) | Real personal Vault, 60 held-out queries (`bge-m3` + `gemma4:e4b` judge) | [S2 report](./docs/testing/career-retrieval-s2-report.md) |
| End-to-end career flow | Verified completion **0.25 → 0.81**, ground-truth recall **0.63 → 1.00**, fabricated drafts on no-evidence prompts **0 / 24**, runtime errors **4 → 0** | Synthetic fixture Vault, 22 queries, local `gemma4:e4b` (directional; real Vault 1,400-token truncation open) | [Real-model report](./docs/testing/career-flow-real-model-report.md) |
| Bundle budget | `main.js` **826.1 KB** (845,958 B) / **900 KB** budget; `styles.css` **50.0 KB** (avoided +1,106–1,170 KB LangGraph/`createAgent` overhead) | Local production build (`esbuild` + Tailwind v4), enforced by `plugin/build.mjs` | [ADR 0008](./docs/adr/0008-no-agent-framework.md), [A11y & bundle report](./docs/testing/a11y-and-bundle-report.md) |
| Tests & boundaries | **435 passed** across **65 suites** (live-model eval suites skipped without env vars); **0 boundary violations** (114 modules, 354 deps) | Local `pnpm typecheck && pnpm test && pnpm boundaries` | [A11y & bundle report](./docs/testing/a11y-and-bundle-report.md) |
| Design system a11y | **19 / 19 stories** passing with `a11y.test: "error"` after catching & fixing 3 WCAG AA contrast defects (**2.54–2.93:1 → 5.52–6.36:1**) | Local Playwright Chromium + axe-core 4.13 (`pnpm run test:ds`) | [A11y & bundle report](./docs/testing/a11y-and-bundle-report.md) |
| CI & release gates | PR/push CI runs typecheck, Vitest, dependency-cruiser, 900 KB build check, `pnpm audit --prod --audit-level=high`, Storybook build, and Playwright a11y; Pages deploy on `design-system/**` | GitHub Actions workflows (manual [Obsidian checklist](./docs/testing/obsidian-manual-checklist.md) remains open) | [ci.yml](./.github/workflows/ci.yml), [storybook-pages.yml](./.github/workflows/storybook-pages.yml) |

## Network use

Both of today's network paths are listed here rather than buried:

- **A local model provider over localhost.** You install and run it yourself — Ollama, llama.cpp, LM Studio or another. Today Fathomark sends vault content nowhere else.
- **Wikipedia, only if you turn Wikipedia Research on.** It is off by default. Queries carry only public topic terms and never names, phrases, paths or metadata found only in your vault, and every query sent is visible in the run's tool activity.

Drafting with your own Codex CLI is proposed ([ADR 0010](docs/adr/0010-local-curation-codex-drafting.md)) and not implemented. When it ships, the local model selects the evidence a request needs, and only that evidence leaves your machine, after consent that shows what will be sent.

There is no telemetry, no account, and no general web access.

## Product boundaries

- Obsidian is the only user-facing product surface.
- VS Code-style sidebar agents are an interaction reference, not an additional target platform or extension.
- The initial Agent Harness runs inside the desktop plugin.
- The workflow and agent loop are product-owned code; LangChain and LangGraph are not used ([ADR 0008](docs/adr/0008-no-agent-framework.md)).
- The model sits behind a replaceable provider adapter: Ollama's native API today. The proposed split is a local model that selects and checks evidence and your Codex CLI that drafts, with the local model drafting when no Codex subscription is available.
- There is no MCP server, general-purpose CLI product, or product-owned companion daemon in the initial architecture.
- Vault content leaves your machine only after explicit consent that shows what will be sent. Network access is limited to a drafting model you choose and bounded Wikipedia Research; other network tools are deferred.
- Fathomark does not train or fine-tune models. Personalization uses your own selected writing as examples ([ADR 0007](docs/adr/0007-grounded-career-writing-with-hosted-models.md)).

## MVP

Vault Chat lets a user:

1. Ask a question from the current note or selection.
2. Search and read only the needed Vault evidence and, when explicitly enabled, bounded Wikipedia evidence.
3. Stream a source-linked answer from the configured model in the selected writing style.
4. Review the sources and tool activity.
5. Preview a proposed insertion and apply it only after approval.

## Development

```bash
pnpm install
pnpm build                                  # main.js + styles.css at the repository root
FATHOMARK_VAULT=~/vaults/scratch pnpm dev   # watch, straight into a scratch vault
pnpm typecheck && pnpm test && pnpm boundaries
pnpm storybook                              # the design system
pnpm run build:storybook && pnpm run test:ds # static Storybook build + Playwright a11y suite
```

The repository root is the plugin's publishing surface: `manifest.json` and `versions.json` are committed there, and `main.js` and `styles.css` are built there and attached to a release. Sources live in `plugin/`, the component library in `design-system/`, and the optional training workspace in `model/`. [PLUGIN.md](./docs/PLUGIN.md) has the details.

## Documentation

- [Product brief](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Technology stack](./docs/TECH_STACK.md)
- [Plugin workspace, build and release](./docs/PLUGIN.md)
- [Model selection and evaluation](./docs/MODEL_SELECTION.md)
- [Direction: current state, next steps, open decisions](./docs/DIRECTION.md)
- [Accessibility, bundle & quality report](./docs/testing/a11y-and-bundle-report.md)
- [Domain language](./CONTEXT.md)
- [Architecture decisions](./docs/adr/)

## Recommended next step

Read [DIRECTION.md](./docs/DIRECTION.md). The next step is the A/B check that decides ADR 0010.
