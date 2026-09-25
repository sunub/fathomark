import { Plugin, type WorkspaceLeaf } from "obsidian";

import { AgentHarness } from "./harness/harness";
import { PROPOSED_LIMITS } from "./harness/budget";
import { EditorAdapter } from "./obsidian/editor-adapter";
import { VaultAdapter } from "./obsidian/vault-adapter";
import { FakeModelProvider } from "./providers/fake";
import { DEFAULT_SETTINGS, type FathomarkSettings, parseSettings } from "./settings";
import { ToolRegistry } from "./tools/registry";
import { CHAT_VIEW_TYPE, ChatView } from "./view/chat-view";
import { FathomarkSettingTab } from "./view/settings-tab";

export default class FathomarkPlugin extends Plugin {
  // Obsidian's Plugin declares `settings?: unknown` and asks that loaded data
  // be assigned to it in onload, so this narrows the base member rather than
  // shadowing it with a second field.
  override settings: FathomarkSettings = DEFAULT_SETTINGS;
  private harness!: AgentHarness;

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    const vault = new VaultAdapter(this.app);
    const editor = new EditorAdapter(this.app);
    const tools = new ToolRegistry();

    /*
     * The fake provider, until ROADMAP open decision 4 picks between Ollama
     * native and an OpenAI-compatible adapter. Phase 0 only needs a stream that
     * can be started, watched and cancelled.
     */
    this.harness = new AgentHarness({
      provider: new FakeModelProvider({ chunkDelayMs: 40, firstEventDelayMs: 250 }),
      tools,
      limits: PROPOSED_LIMITS,
      permissions: { networkResearchEnabled: this.settings.networkResearchEnabled },
      model: this.settings.model,
    });

    this.registerView(
      CHAT_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new ChatView(leaf, this.harness, editor, this.settings.model),
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
