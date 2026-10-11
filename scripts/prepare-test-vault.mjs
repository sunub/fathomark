#!/usr/bin/env node
/*
 * Creates a disposable Obsidian vault for the manual checklist in
 * docs/testing/obsidian-manual-checklist.md:
 *
 *   node scripts/prepare-test-vault.mjs ~/vaults/fathomark-check
 *
 * It copies the synthetic career fixture vault, builds the plugin into
 * .obsidian/plugins/fathomark, marks it enabled and seeds its settings.
 * It refuses an existing folder so it can never overwrite a real vault.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/prepare-test-vault.mjs <new vault folder>");
  process.exit(1);
}
const vault = resolve(target.replace(/^~/, process.env.HOME ?? "~"));
if (existsSync(vault)) {
  console.error(`${vault} already exists. Choose a new folder; this script never overwrites a vault.`);
  process.exit(1);
}

cpSync(join(repoRoot, "plugin/tests/fixtures/career-vault"), vault, { recursive: true });
writeFileSync(join(vault, "자기소개서.md"), "# 자기소개서\n\n지원 문항: 성능 문제를 해결한 경험을 500자 내외로 서술해 주세요.\n\n");

const pluginDir = join(vault, ".obsidian", "plugins", "fathomark");
mkdirSync(pluginDir, { recursive: true });
writeFileSync(join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["fathomark"]));
writeFileSync(join(pluginDir, "data.json"), JSON.stringify({ model: "gemma4:e4b", experienceFolder: "경험", semanticSearch: true }, null, 2));

const build = spawnSync("pnpm", ["--filter", "fathomark-plugin", "run", "build"], {
  cwd: repoRoot,
  env: { ...process.env, FATHOMARK_VAULT: vault },
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`\nTest vault ready: ${vault}\nOpen it in Obsidian (Open folder as vault), turn on community plugins if asked, then follow docs/testing/obsidian-manual-checklist.md.`);
