---
status: accepted
---

# Build the Chat UI in React, bundled into the plugin

ROADMAP listed "UI implementation: Obsidian DOM or React" as open decision 6. It is now settled in favour of React, rendered into a single Obsidian `ItemView` through `createRoot`.

The deciding factor is not developer comfort but reviewability. The panel's rules are visual ones — the composer is always present, terminal outcomes never disable input, tool activity never becomes prose, a filled brand button exists in exactly two places — and they are stated in Storybook under `Fathomark/Chat`. A component library that renders in Storybook lets those rules be seen and regression-tested outside Obsidian, against a design system that already exists. Hand-built DOM would move the same rules into imperative code that can only be checked by loading a vault.

The cost is real and measured rather than assumed. React, React DOM, Base UI and the icon set come to roughly 286 KB minified in `main.js`, all of it parsed during plugin startup, against an architecture that requires startup to stay cheap. `plugin/build.mjs` prints that number on every production build and fails above a declared budget, so the cost stays visible and growing it stays a decision.

Two consequences follow. Obsidian's own CSS variables are not the panel's palette: the Fathomark tokens are, and the plugin only borrows Obsidian's interface fonts because it cannot ship its own. And the design system is consumed as source from a workspace package rather than as a built artifact, so there is no `dist` to keep in sync and the plugin's own type check reads the components directly.

The analogy to a VS Code sidebar agent stops where it always stopped. React here renders one view inside Obsidian; it does not make the panel a web app, and it does not introduce a router, a second window, or a rendering surface outside the leaf.
