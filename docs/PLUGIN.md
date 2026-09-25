# Plugin workspace

How the Obsidian plugin is laid out, built, and released. The product decisions behind it are in [PRODUCT.md](./PRODUCT.md) and [ARCHITECTURE.md](./ARCHITECTURE.md); this document is about the mechanics.

## Repository shape

The community plugin directory reads `manifest.json`, `README.md` and `LICENSE` from the **root of the repository**, and a release must attach `main.js`, `manifest.json` and `styles.css` as flat assets. That requirement, not taste, is why the repository root is the plugin's publishing surface while the source lives one level down.

```text
fathomark/
├── manifest.json        committed — the single source of truth for the version
├── versions.json        committed — version → minAppVersion
├── main.js              built, gitignored, attached to the release
├── styles.css           built, gitignored, attached to the release
├── LICENSE  README.md
├── plugin/              everything that ships
├── design-system/       the component library and Storybook
├── model/               the optional Python training workspace (ADR 0003)
└── docs/
```

`pnpm-workspace.yaml` ties `plugin` and `design-system` together. That matters for one specific reason: the plugin bundles the design system's `.tsx` files directly, and if the two packages resolved different copies of React the bundle would contain both and every hook would throw. A single workspace gives one React; `plugin/build.mjs` also pins `react` and `react-dom` through esbuild's `alias`, because that failure is late, confusing, and worth two defences.

## Source layout

Each directory under `plugin/src` is a component from ARCHITECTURE.md, in the same words:

```text
plugin/src/
├── main.ts        plugin lifecycle — cheap onload, complete onunload
├── view/          the ItemView, and the only place React meets Obsidian
├── ui/            Chat UI — presentation only
├── harness/       Agent Harness — run state, permissions, budget, cancellation
├── context/       Agent Context Pipeline — ContextPacket, EvidenceReference
├── tools/         Tool Registry
├── providers/     ModelProvider adapters, including the deterministic fake
├── obsidian/      Vault and editor adapters
└── settings/      persisted settings
```

Two boundaries from the architecture are enforced by `pnpm boundaries`, not by review:

- **The Chat UI owns no policy.** It reads `RunEvent` and calls two commands. It cannot import the harness engine, a provider, a tool, or `obsidian`.
- **LangChain stays inside the harness.** Nothing outside `src/harness` may import it.

The second rule guards something that does not exist yet. LangChain is absent from the current bundle on purpose: Phase 0 only needs a stream that starts, is watched and is cancelled, and keeping the seam empty for one phase gives a size baseline to compare `createAgent` against.

## Build

```bash
pnpm build      # main.js + styles.css at the repository root
pnpm dev        # watch both
pnpm typecheck  pnpm test  pnpm boundaries
pnpm storybook  # the design system
```

To develop against a real vault, point the build at it — `manifest.json` is copied alongside, so the folder is loadable as-is:

```bash
FATHOMARK_VAULT=~/vaults/scratch pnpm dev
```

`plugin/build.mjs` prints the minified size of `main.js` on every production build and fails above a declared budget. The budget is a tripwire rather than a limit: it makes adding a dependency a decision instead of a drift, against an architecture that requires startup to stay cheap.

## Styling

Obsidian injects a plugin's `styles.css` into its own document, globally. Everything in the pipeline follows from that one fact.

**Preflight is off.** `@fathomark/design-system/tailwind.css` imports Tailwind's theme and utilities layers and omits `preflight.css`. A reset would repaint Obsidian's own chrome, not just the panel.

**Utilities are prefixed `tw:`.** A bare `.flex` in a global stylesheet collides with Obsidian and with every other plugin. The prefix is `tw` rather than `fm` for a concrete reason: Tailwind's default theme already declares `--font-sans`, so `prefix(fm)` would emit `--fm-font-sans` on top of the one `fathomark.css` declares. Keeping the namespaces apart also makes markup readable — `tw:bg-fm-brand` says "Tailwind utility, Fathomark token".

**Content detection is explicit.** `source(none)` plus `@source` lines. Left automatic, Tailwind walks outwards from the stylesheet and scans the Python workspace, `storybook-static` and every comment in the tree; scanning prose generates rules for words like `table` and `outline` and ships them to every user.

**Nothing selects globally.** No `*`, `html`, `body` or `:root` reaches `styles.css`. The panel's rules hang off `.fathomark-root`, and the view's container carries `fathomark-root dark theme-fathomark` — `dark` so the components' `dark:` utilities apply, `theme-fathomark` for the palette.

**Fonts fall back to Obsidian's.** The tokens name Public Sans and IBM Plex Mono, which the plugin cannot ship: loading fonts over the network is off-limits and inlining them would multiply the size of `styles.css`. `--fm-font-sans` and `--fm-font-mono` are redefined on `.fathomark-root` to Obsidian's interface and monospace fonts, so the two voices from Foundations/Typography survive even though the exact faces do not.

## Release

```bash
npm version patch     # writes package.json, manifest.json and versions.json
git push && git push --tags
```

`.github/workflows/release.yml` builds, refuses to continue if the tag disagrees with `manifest.json`, attaches a build provenance attestation, and opens a draft release with the three assets. The tag carries no leading `v`.

Before the first submission, the README has to disclose network use — Fathomark talks to a local model provider over localhost, and to Wikipedia once the user turns Wikipedia Research on.
