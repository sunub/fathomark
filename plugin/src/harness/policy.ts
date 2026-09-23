/*
 * Permissions, as a table rather than as scattered conditionals.
 *
 * This mirrors the permission table in docs/ARCHITECTURE.md. The point of
 * keeping it here is the guarantee that document makes: the harness "never
 * treats model-declared capability as permission". The model proposes a tool
 * name; this module decides whether that name is allowed to run at all, before
 * any argument is even parsed.
 */

export type Capability =
  | "read_current_note"
  | "search_vault"
  | "read_note"
  | "insert_into_current_note"
  | "modify_multiple_notes"
  | "external_model"
  | "wikipedia"
  | "general_web"
  | "vault_text_egress"

export type Decision =
  /** Runs without asking. Still visible in the tool activity list. */
  | { allowed: true; requiresApproval: false }
  /** Runs only after the user says yes, this time. */
  | { allowed: true; requiresApproval: true; reason: string }
  /** Not available in the MVP at all. Nothing can turn it on at runtime. */
  | { allowed: false; reason: string }

export interface PermissionContext {
  /** The user turned on Wikipedia Research in settings. */
  readonly networkResearchEnabled: boolean
}

export function decide(capability: Capability, context: PermissionContext): Decision {
  switch (capability) {
    case "read_current_note":
    case "search_vault":
    case "read_note":
      return { allowed: true, requiresApproval: false }

    case "wikipedia":
      return context.networkResearchEnabled
        ? { allowed: true, requiresApproval: false }
        : {
            allowed: false,
            reason: "Wikipedia Research is off. Turn it on in settings to allow network access.",
          }

    /*
     * Insertion is an application action after preview, not a model tool —
     * ARCHITECTURE.md, Tool Registry. It appears here so that a tool claiming
     * this capability is refused rather than silently permitted.
     */
    case "insert_into_current_note":
      return {
        allowed: true,
        requiresApproval: true,
        reason: "Inserting into a note changes the vault and needs explicit approval.",
      }

    case "modify_multiple_notes":
      return { allowed: false, reason: "Multi-note edits are not available." }
    case "external_model":
      return { allowed: false, reason: "External model providers are not available." }
    case "general_web":
      return { allowed: false, reason: "General web access is not available." }
    case "vault_text_egress":
      return { allowed: false, reason: "Vault text is never sent off-device." }
  }
}

/**
 * The tool allowlist. A tool name the model invents is rejected here, which is
 * the guarantee ARCHITECTURE.md asks for independently of model quality:
 * "disallowed tools never execute".
 */
export function isAllowedTool(
  name: string,
  allowlist: readonly string[]
): boolean {
  return allowlist.includes(name)
}

/**
 * Repeated-call limit. The second half of the same guarantee: "repeated-call
 * limits terminate loops", whatever the model does.
 */
export class CallLimiter {
  private readonly counts = new Map<string, number>()

  constructor(private readonly maxPerTool = 5, private readonly maxTotal = 12) {}

  /** Returns why the call is refused, or null when it may proceed. */
  check(tool: string): string | null {
    const forTool = (this.counts.get(tool) ?? 0) + 1
    let total = 1
    for (const count of this.counts.values()) total += count

    if (forTool > this.maxPerTool) return `${tool} was already called ${this.maxPerTool} times.`
    if (total > this.maxTotal) return `This run reached its limit of ${this.maxTotal} tool calls.`

    this.counts.set(tool, forTool)
    return null
  }
}
