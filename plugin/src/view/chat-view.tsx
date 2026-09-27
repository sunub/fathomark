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
import type { RunInput } from "../harness/harness"
import type { RunSession } from "../harness/session"
import { EditorAdapter } from "../obsidian/editor-adapter"
import { createResearchTopic } from "../tools/research-topic"
import { App } from "../ui/App"

export const CHAT_VIEW_TYPE = "fathomark-chat"

export class ChatView extends ItemView {
  private root: Root | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly harness: AgentHarness,
    private readonly session: RunSession,
    private readonly editor: EditorAdapter,
    private readonly modelLabel: string
  ) {
    super(leaf)
  }

  private researchTopic: ReturnType<typeof createResearchTopic> | null = null
  private lastInput: RunInput | null = null

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
          getSnapshot={() => this.session.getSnapshot()}
          subscribe={(listener) => this.session.subscribe(listener)}
          commands={{
            ask: async (question) => {
              if (this.harness.currentState() !== "idle" && !["complete", "incomplete", "cancelled", "failed"].includes(this.harness.currentState())) {
                return { accepted: false, reason: "A run is already active." }
              }
              const input: RunInput = {
                question,
                packet: {
                  systemInstructions:
                    "You answer from the user's Obsidian vault and cite the notes you used.",
                  currentNote: this.editor.currentNote(),
                  style: null,
                  researchTopic: this.researchTopic,
                  evidence: [],
                  conversation: [],
                  omitted: [],
                },
              }
              this.lastInput = input
              void this.harness.run(input)
              return { accepted: true }
            },
            stop: () => this.harness.cancel(),
            retry: async () => {
              if (!this.lastInput) return { accepted: false, reason: "There is no run to retry." }
              void this.harness.run(this.lastInput)
              return { accepted: true }
            },
            openSource: async (reference) => {
              if (reference.kind === "vault") {
                await this.app.workspace.openLinkText(reference.path, "", false)
              } else {
                window.open(reference.url, "_blank", "noopener,noreferrer")
              }
            },
            setResearchTopic: (text, language) => {
              this.researchTopic = text.trim() ? createResearchTopic(text, language) : null
            },
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
