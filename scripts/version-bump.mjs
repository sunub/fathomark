/*
 * Keeps manifest.json and versions.json in step with package.json.
 *
 * Run through `npm version <patch|minor|major>`, which writes package.json and
 * then invokes the `version` script. The release tag must equal the version in
 * manifest.json exactly — no leading `v` — or the community directory rejects
 * the release.
 *
 * minAppVersion is deliberately NOT bumped here. Raising it is a decision about
 * which Obsidian APIs the plugin now requires, so it is edited by hand in
 * manifest.json and picked up by this script on the next release.
 */
import { readFileSync, writeFileSync } from "node:fs"

const targetVersion = process.env.npm_package_version
if (!targetVersion) {
  throw new Error("Run this through `npm version`, which sets npm_package_version.")
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"))
const { minAppVersion } = manifest
manifest.version = targetVersion
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n")

const versions = JSON.parse(readFileSync("versions.json", "utf8"))
versions[targetVersion] = minAppVersion
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n")

console.log(`manifest.json and versions.json set to ${targetVersion} (minAppVersion ${minAppVersion})`)
