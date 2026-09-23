/*
 * The settings tab.
 *
 * `setHeading()` rather than an <h2>, and Setting rows rather than hand-built
 * markup, because Obsidian's guidelines ask for it and because a settings pane
 * that matches the rest of the app is one the user does not have to read twice.
 */

import { type App as ObsidianApp, type Plugin, PluginSettingTab, Setting } from "obsidian"

import type { SettingsHost } from "../settings"

export class FathomarkSettingTab extends PluginSettingTab {
  constructor(app: ObsidianApp, private readonly plugin: Plugin & SettingsHost) {
    super(app, plugin)
  }

  override display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl).setName("Model").setHeading()

    new Setting(containerEl)
      .setName("Provider address")
      .setDesc("Where your local model provider listens. Fathomark only talks to localhost.")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:11434")
          .setValue(this.plugin.settings.providerBaseUrl)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ providerBaseUrl: value.trim() })
          })
      )

    new Setting(containerEl).setName("Research").setHeading()

    new Setting(containerEl)
      .setName("Wikipedia Research")
      .setDesc(
        "Lets Fathomark search and read Wikipedia. Queries contain only public topic " +
          "terms — never names, phrases or paths found only in your vault — and every " +
          "query sent is shown in the run's tool activity."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.networkResearchEnabled)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ networkResearchEnabled: value })
          })
      )
  }
}
