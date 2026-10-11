import { Plugin, type WorkspaceLeaf } from "obsidian";

import { AgentHarness } from "./harness/harness";
import { RunSession } from "./harness/session";
import { SelectedStyleStore } from "./context/style";
import { PROPOSED_LIMITS } from "./harness/budget";
import { EditorAdapter } from "./obsidian/editor-adapter";
import { EditorTargetTracker } from "./obsidian/editor-target";
import { PreviewController } from "./obsidian/insertion-preview";
import { VaultAdapter } from "./obsidian/vault-adapter";
import { createOllamaProvider } from "./providers/ollama";
import { createLocalCounter } from "./context/local-counter";
import { pastedSourceReader } from "./workflow/public-sources";
import { DEFAULT_SETTINGS, type FathomarkSettings, parseSettings } from "./settings";
import { createToolRegistry } from "./tools/create-registry";
import { CHAT_VIEW_TYPE, ChatView } from "./view/chat-view";
import { FathomarkSettingTab } from "./view/settings-tab";

export default class FathomarkPlugin extends Plugin {
  // Obsidian's Plugin declares `settings?: unknown` and asks that loaded data
  // be assigned to it in onload, so this narrows the base member rather than
  // shadowing it with a second field.
  override settings: FathomarkSettings = DEFAULT_SETTINGS;
  private harness!: AgentHarness;
  private session!: RunSession;
  private tracker!: EditorTargetTracker;
  private styleStore!: SelectedStyleStore;
  private previewController!: PreviewController;

  override async onload(): Promise<void> {
    // plugin 에 등록되어 있는 기본적인 옵시디언 설정 값을 읽어오기
    this.settings = parseSettings(await this.loadData());
    this.styleStore = new SelectedStyleStore(
      async (selectedStyle) => this.updateSettings({ selectedStyle }),
      this.settings.selectedStyle,
    );

    const vault = new VaultAdapter(this.app);
    this.tracker = new EditorTargetTracker(this.app);
    this.previewController = new PreviewController(this.tracker);
    const editor = new EditorAdapter(this.app, this.tracker);
    const tools = createToolRegistry({
      vault,
      experienceFolder: () => this.settings.experienceFolder,
      includeQuestions: true,
    });

    this.harness = new AgentHarness({
      provider: createOllamaProvider(DEFAULT_SETTINGS.providerBaseUrl),
      tools,
      limits: PROPOSED_LIMITS,
      permissions: () => ({ networkResearchEnabled: this.settings.networkResearchEnabled }),
      model: this.settings.model,
      counter: createLocalCounter(),
      resolveRuntime: input => ({
        provider: createOllamaProvider(this.settings.providerBaseUrl),
        model: this.settings.model,
        counter: createLocalCounter(),
        tools: createToolRegistry({ vault, experienceFolder: () => this.settings.experienceFolder, includeQuestions: true, publicSources: pastedSourceReader(input.pastedSource) }),
      }),
    });
    this.session = new RunSession(this.harness);

    this.registerView(
      CHAT_VIEW_TYPE,
      (leaf: WorkspaceLeaf) =>
        new ChatView(
          leaf,
          this.harness,
          this.session,
          editor,
          this.styleStore,
          this.previewController,
          this.settings.model,
        ),
    );

    this.addRibbonIcon("sparkles", "Open Fathomark chat", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-chat",
      name: "Open chat",
      // No default hotkey: the guidelines warn that defaults collide.
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "stop-generating",
      name: "Stop generating",
      callback: () => this.harness.cancel(),
    });

    this.addSettingTab(new FathomarkSettingTab(this.app, this));

    /*
     * Anything that touches the vault waits for the workspace. Doing it inline
     * above would make every Obsidian start slower by however long this takes.
     */
    this.app.workspace.onLayoutReady(() => {
      void vault.listNotes().length;
    });
  }

  override onunload(): void {
    // Cancels any active run and drops every listener. Safe when idle.
    this.harness?.dispose();
    this.session?.dispose();
    this.tracker?.dispose();
    this.previewController?.dispose();
  }

  async updateSettings(patch: Partial<FathomarkSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await this.saveData(this.settings);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;

    // Reuse an existing leaf rather than stacking duplicates.
    const existing = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }
}
