/**
 * Which notes count as "experience" notes for ranking (plan S2). A note qualifies when
 * it meets any one criterion of the rule. Only the leading frontmatter block is read,
 * and only `type` and `tags`, so no YAML library is needed.
 */
export interface ExperienceRule {
  /** Frontmatter `type` value, e.g. "experience". */
  readonly type?: string
  /** A frontmatter tag, with or without a leading `#`. */
  readonly tag?: string
  /** Vault-relative folder, or several separated by commas; subfolders count. */
  readonly folder?: string
}

export const DEFAULT_EXPERIENCE_RULE: ExperienceRule = { type: "experience" }

/** The default rule, plus a folder when the user set one. A blank folder means "not set". */
export function experienceRuleFor(folder: string): ExperienceRule {
  const trimmed = folder.trim()
  return trimmed === "" ? DEFAULT_EXPERIENCE_RULE : { ...DEFAULT_EXPERIENCE_RULE, folder: trimmed }
}

export function isExperienceNote(
  path: string,
  content: string,
  rule: ExperienceRule = DEFAULT_EXPERIENCE_RULE
): boolean {
  const frontmatter = leadingFrontmatter(content)
  if (rule.type !== undefined && frontmatter !== null && scalar(frontmatter, "type") === clean(rule.type)) {
    return true
  }
  if (rule.tag !== undefined && frontmatter !== null && list(frontmatter, "tags").includes(clean(rule.tag.replace(/^#/, "")))) {
    return true
  }
  if (rule.folder !== undefined) {
    const normalized = path.normalize("NFC").toLocaleLowerCase()
    return rule.folder
      .split(",")
      .map((item) => clean(item).replace(/\/+$/, ""))
      .some((folder) => folder !== "" && normalized.startsWith(`${folder}/`))
  }
  return false
}

function leadingFrontmatter(content: string): string[] | null {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return null
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  return end === -1 ? null : lines.slice(1, end)
}

function scalar(frontmatter: readonly string[], key: string): string | null {
  for (const line of frontmatter) {
    const match = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*$`).exec(line)
    if (match?.[1]) return clean(match[1])
  }
  return null
}

/** Handles `key: [a, b]`, `key: a, b` and a block list under `key:`. */
function list(frontmatter: readonly string[], key: string): string[] {
  const start = frontmatter.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line))
  if (start === -1) return []
  const inline = (frontmatter[start] ?? "").replace(new RegExp(`^${key}\\s*:`), "").trim()
  if (inline !== "") {
    return inline.replace(/^\[|\]$/g, "").split(",").map((item) => clean(item.replace(/^#/, ""))).filter(Boolean)
  }
  const items: string[] = []
  for (const line of frontmatter.slice(start + 1)) {
    const match = /^\s*-\s*(.+?)\s*$/.exec(line)
    if (!match?.[1]) break
    items.push(clean(match[1].replace(/^#/, "")))
  }
  return items
}

function clean(value: string): string {
  return value.normalize("NFC").trim().replace(/^["']|["']$/g, "").toLocaleLowerCase()
}
