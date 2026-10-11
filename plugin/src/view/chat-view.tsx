import { ItemView, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { type Root, createRoot } from "react-dom/client";

import type { AgentHarness, RunInput } from "../harness/harness";
import { approvedRevision, revisionPreview } from "../harness/revision";
import type { RunSession } from "../harness/session";
import type { SelectedStyleStore } from "../context/style";
import { EditorAdapter } from "../obsidian/editor-adapter";
import type { PreviewController } from "../obsidian/insertion-preview";
import { createResearchTopic } from "../tools/research-topic";
import { App } from "../ui/App";

export const CHAT_VIEW_TYPE = "fathomark-chat";

export class ChatView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly harness: AgentHarness,
    private readonly session: RunSession,
    private readonly editor: EditorAdapter,
    private readonly styleStore: SelectedStyleStore,
    private readonly previewController: PreviewController,
    private readonly modelLabel: string,
  ) {
    super(leaf);
  }

  private researchTopic: ReturnType<typeof createResearchTopic> | null = null;

  override getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Fathomark";
  }

  override getIcon(): string {
    return "sparkles";
  }

  override async onOpen(): Promise<void> {
    const host = this.contentEl.createDiv({
      cls: "fathomark-root dark theme-fathomark",
    });

    this.root = createRoot(host);
    this.root.render(
      <StrictMode>
        <App
          getSnapshot={() => this.session.getSnapshot()}
          subscribe={(listener) => this.session.subscribe(listener)}
          commands={{
            ask: async (question, pastedSource) => {
              if (
                this.harness.currentState() !== "idle" &&
                !["complete", "incomplete", "cancelled", "failed"].includes(
                  this.harness.currentState(),
                )
              ) {
                return { accepted: false, reason: "A run is already active." };
              }
              const target = this.editor.captureTarget();
              // Read before the run starts: a new run replaces the snapshot it comes from.
              const previous = this.session.followUp();
              const input: RunInput = {
                question,
                mode: "career",
                target,
                ...(pastedSource ? { pastedSource } : {}),
                ...(previous ? { previous } : {}),
                stage: target?.selection ? "revise" : "explore",
                packet: {
                  systemInstructions:
                    "You answer from the user's Obsidian vault and cite the notes you used.",
                  currentNote: target
                    ? this.editor.noteFromTarget(target)
                    : this.editor.currentNote(),
                  style: this.styleStore.get(),
                  researchTopic: this.researchTopic,
                  evidence: [],
                  conversation: [],
                  omitted: [],
                },
              };
              this.session.rememberRequest(input, target);
              void this.harness.run(input);
              return { accepted: true };
            },
            stop: () => this.harness.cancel(),
            answerQuestion: (questionId, answer) => this.harness.answerQuestion(questionId, answer),
            retry: async () => {
              const request = this.session.lastRequest();
              if (!request) return { accepted: false, reason: "There is no run to retry." };
              void this.harness.run(request.input);
              return { accepted: true };
            },
            openSource: async (reference) => {
              if (reference.kind === "vault") {
                await this.app.workspace.openLinkText(reference.path, "", false);
              } else if (reference.kind === "external") {
                window.open(reference.url, "_blank", "noopener,noreferrer");
              }
            },
            setResearchTopic: (text, language) => {
              this.researchTopic = text.trim() ? createResearchTopic(text, language) : null;
            },
            selectStyle: async () => {
              const selection = this.editor.currentSelection();
              if (!selection) throw new Error("Select a passage in a note first.");
              this.harness.cancel();
              this.styleStore.select(selection);
            },
            clearStyle: async () => {
              this.harness.cancel();
              this.styleStore.clear();
              await this.styleStore.persist();
            },
            saveStyle: async () => {
              if (!this.styleStore.get()) throw new Error("Select a style before saving it.");
              await this.styleStore.persist();
            },
            setDraft: (draft) => this.session.setDraft(draft),
            previewBlockedReason: (recapture = false) => {
              if (this.session.lastRequest()?.input.mode === "career") {
                if (recapture) return "문서가 바뀌어 검증한 글을 그대로 적용할 수 없습니다. 같은 요청을 다시 실행해 바뀐 문서 기준으로 새로 검증해 주세요.";
                const final = this.session.getVerifiedDraft();
                return final?.target ? null : "검증된 글과 적용할 문서가 있어야 미리보기를 만들 수 있습니다.";
              }
              const request = this.session.lastRequest();
              if (request?.input.stage !== "revise") return "There is no answer to preview.";
              const selection = request.target?.selection;
              if (selection === undefined) return "There is no selected passage to replace.";
              const preview = revisionPreview(this.session.getSnapshot().events, selection);
              return preview.ok ? null : preview.reason;
            },
            previewAnswer: (recapture = false) => {
              if (this.session.lastRequest()?.input.mode === "career") {
                const final = this.session.getVerifiedDraft();
                // A changed document requires a new run and verification, not a fresh approval of old text.
                if (!final?.target || recapture) return null;
                return this.previewController.create(final.target, final.text);
              }
              const request = this.session.lastRequest();
              const target = recapture ? this.editor.captureTarget() : request?.target;
              if (!target) return null;
              const { events } = this.session.getSnapshot();
              // A revision run previews only a checked proposal for the chosen passage, never its prose.
              const answer =
                request?.input.stage === "revise"
                  ? approvedRevision(events, target.selection)
                  : events
                      .filter((event) => event.type === "text")
                      .map((event) => event.delta)
                      .join("");
              return answer ? this.previewController.create(target, answer) : null;
            },
            approveInsertion: (id) => {
              this.previewController.approve(id);
              const preview = this.previewController.get(id);
              if (preview?.status === "applied") this.session.markApplied();
              return preview;
            },
            discardInsertion: (id) => {
              this.previewController.discard(id);
              return this.previewController.get(id);
            },
          }}
          modelLabel={this.modelLabel}
        />
      </StrictMode>,
    );
  }

  override async onClose(): Promise<void> {
    /*
     * Unmount before the element goes away. React keeps listeners and effects
     * alive until it is told to stop, and a view is closed and reopened often
     * enough that skipping this leaks on every toggle.
     */
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }
}
