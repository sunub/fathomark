import { normalizePath, Plugin, type WorkspaceLeaf } from "obsidian";

import { AgentHarness } from "./harness/harness";
import { RunSession } from "./harness/session";
import { SelectedStyleStore } from "./context/style";
import { PROPOSED_LIMITS } from "./harness/budget";
import { EditorAdapter } from "./obsidian/editor-adapter";
import { EditorTargetTracker } from "./obsidian/editor-target";
import { PreviewController } from "./obsidian/insertion-preview";
import { pluginFileStore } from "./obsidian/index-store";
import { VaultAdapter } from "./obsidian/vault-adapter";
import { createOllamaProvider } from "./providers/ollama";
import { createOllamaEmbedder, DEFAULT_EMBEDDING_MODEL, type Embedder } from "./providers/ollama-embedder";
import { createOllamaJudge, type EvidenceJudge } from "./providers/ollama-judge";
import { SemanticIndexer } from "./retrieval/semantic-indexer";
import { VectorIndex } from "./retrieval/vector-index";
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
  private vault!: VaultAdapter;
  private indexer!: SemanticIndexer;
  private readonly indexAbort = new AbortController();

  override async onload(): Promise<void> {
    // plugin 에 등록되어 있는 기본적인 옵시디언 설정 값을 읽어오기
    this.settings = parseSettings(await this.loadData());
    this.styleStore = new SelectedStyleStore(
      async (selectedStyle) => this.updateSettings({ selectedStyle }),
      this.settings.selectedStyle,
    );

    const vault = new VaultAdapter(this.app);
    this.vault = vault;
    // Built per call, so a changed provider URL or model applies at once and a bad URL cannot break onload.
    const embedder: Embedder = {
      model: DEFAULT_EMBEDDING_MODEL,
      embed: (texts, signal) => createOllamaEmbedder(this.settings.providerBaseUrl).embed(texts, signal),
    };
    const judge = (): EvidenceJudge => ({
      model: this.settings.model,
      supports: (question, excerpt, signal) => createOllamaJudge(this.settings.providerBaseUrl, this.settings.model).supports(question, excerpt, signal),
    });
    const indexPath = normalizePath(`${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/vector-index.json`);
    this.indexer = new SemanticIndexer(
      new VectorIndex(embedder, pluginFileStore(this.app.vault.adapter, indexPath)),
      embedder,
      () => this.settings.semanticSearch,
      judge,
    );
    const semantic = () => this.indexer.backend();
    this.tracker = new EditorTargetTracker(this.app);
    this.previewController = new PreviewController(this.tracker);
    const editor = new EditorAdapter(this.app, this.tracker);
    const tools = createToolRegistry({
      vault,
      experienceFolder: () => this.settings.experienceFolder,
      includeQuestions: true,
      semantic,
    });

    this.harness = new AgentHarness({
      provider: createOllamaProvider(DEFAULT_SETTINGS.providerBaseUrl),
      tools,
      limits: PROPOSED_LIMITS,
      permissions: () => ({ networkResearchEnabled: this.settings.networkResearchEnabled }),
      model: this.settings.model,
      counter: createLocalCounter(),
      resolveRuntime: input => {
        // Picks up notes changed since the last refresh; the run does not wait for it.
        void this.indexer.refresh(vault, this.indexAbort.signal);
        return {
          provider: createOllamaProvider(this.settings.providerBaseUrl),
          model: this.settings.model,
          counter: createLocalCounter(),
          tools: createToolRegistry({ vault, experienceFolder: () => this.settings.experienceFolder, includeQuestions: true, publicSources: pastedSourceReader(input.pastedSource), semantic }),
        };
      },
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
      // Embedding runs in the background; search uses keywords until the index has notes.
      void this.indexer.refresh(vault, this.indexAbort.signal);
    });
  }

  override onunload(): void {
    // Cancels any active run and drops every listener. Safe when idle.
    this.indexAbort.abort();
    this.harness?.dispose();
    this.session?.dispose();
    this.tracker?.dispose();
    this.previewController?.dispose();
  }

  async updateSettings(patch: Partial<FathomarkSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await this.saveData(this.settings);
    if (patch.semanticSearch) void this.indexer.refresh(this.vault, this.indexAbort.signal);
  }

  semanticStatus(): string | null {
    return this.indexer.lastError;
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
