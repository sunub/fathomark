import * as React from "react"
import type { Preview } from "@storybook/react-vite"

import "../src/styles/global.css"
import "./docs.css"

/**
 * Themes. `fathomark` is the plugin theme and the default — most of this library
 * exists to serve it. `dark` and `light` are the plain shadcn tokens, useful for
 * checking that a component still works when it is not wearing the plugin's skin.
 */
const themes = {
  // `dark` too: the components' `dark:` utilities key off it, and the
  // doubled selector in fathomark.css keeps the plugin tokens on top.
  fathomark: { className: "dark theme-fathomark", background: "var(--fm-shell)" },
  dark: { className: "dark", background: "var(--background)" },
  light: { className: "", background: "var(--background)" },
} as const

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    options: {
      storySort: {
        order: [
          "Fathomark",
          ["Introduction", "Foundations", ["Colour", "Typography", "Metrics"], "Chat"],
          "Components",
          "Example",
        ],
      },
    },
    a11y: { test: "todo" },
    // The decorator paints the surface; Storybook's own background control would
    // only fight it.
    backgrounds: { disable: true },
    layout: "fullscreen",
  },
  globalTypes: {
    theme: {
      description: "Token theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "fathomark", title: "Fathomark" },
          { value: "dark", title: "shadcn dark" },
          { value: "light", title: "shadcn light" },
        ],
        dynamicTitle: true,
      },
    },
    /** The plugin lives in a 400px sidebar; most stories should be seen at that width. */
    panel: {
      description: "Constrain the story to the sidebar width",
      toolbar: {
        title: "Width",
        icon: "sidebar",
        items: [
          { value: "sidebar", title: "400px sidebar" },
          { value: "narrow", title: "320px (minimum)" },
          { value: "full", title: "Full width" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "fathomark", panel: "sidebar" },
  decorators: [
    (Story, context) => {
      const theme = themes[context.globals.theme as keyof typeof themes] ?? themes.fathomark
      const width =
        context.globals.panel === "narrow" ? 320 : context.globals.panel === "full" ? "100%" : 400

      return (
        <div
          className={theme.className}
          style={{
            background: theme.background,
            color: "var(--foreground)",
            minHeight: "100vh",
            padding: 16,
          }}
        >
          <div style={{ width, maxWidth: "100%" }}>
            <Story />
          </div>
        </div>
      )
    },
  ],
}

export default preview
