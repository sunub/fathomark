/*
 * The Obsidian view, and the only place React meets Obsidian.
 *
 * This file also wires the panel's two commands to the harness, which is what
 * keeps src/ui free of harness imports — see .dependency-cruiser.cjs.
 */

import { ItemView, type WorkspaceLeaf } from "obsidian"
import { StrictMode } from "react"
import { type Root, createRoot } from "react-dom/client"

import type { AgentHarness } from "../harness/harness"
import { EditorAdapter } from "../obsidian/editor-adapter"
import { App } from "../ui/App"

export const CHAT_VIEW_TYPE = "fathomark-chat"

export class ChatView extends ItemView {
  private root: Root | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly harness: AgentHarness,
    private readonly editor: EditorAdapter,
    private readonly modelLabel: string
  ) {
    super(leaf)
  }

  override getViewType(): string {
    return CHAT_VIEW_TYPE
  }

  override getDisplayText(): string {
    return "Fathomark"
  }

  override getIcon(): string {
    return "sparkles"
  }

  override async onOpen(): Promise<void> {
    const host = this.contentEl.createDiv({
      // `dark` makes the design system's dark: utilities apply, theme-fathomark
      // supplies the palette, fathomark-root is what plugin.css scopes to.
      cls: "fathomark-root dark theme-fathomark",
    })

    this.root = createRoot(host)
    this.root.render(
      <StrictMode>
        <App
          subscribe={(listener) => this.harness.subscribe(listener)}
          commands={{
            ask: (question) => {
              void this.harness.run({
                question,
                packet: {
                  systemInstructions:
                    "You answer from the user's Obsidian vault and cite the notes you used.",
                  currentNote: this.editor.currentNote(),
                  evidence: [],
                  conversation: [],
                  omitted: [],
                },
              })
            },
            stop: () => this.harness.cancel(),
          }}
          modelLabel={this.modelLabel}
        />
      </StrictMode>
    )
  }

  override async onClose(): Promise<void> {
    /*
     * Unmount before the element goes away. React keeps listeners and effects
     * alive until it is told to stop, and a view is closed and reopened often
     * enough that skipping this leaks on every toggle.
     */
    this.root?.unmount()
    this.root = null
    this.contentEl.empty()
  }
}
