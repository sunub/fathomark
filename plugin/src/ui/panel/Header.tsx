/*
 * The header: 44px, no rule beneath it.
 *
 * Chat/Anatomy is strict about what may sit here — the run badge and its
 * mono metadata on the left, history and settings on the right, in that order,
 * and nothing else. No product name and no mark: Obsidian already names this
 * view in its own tab.
 */

import { Badge } from "@fathomark/design-system"
import { HistoryIcon, SettingsIcon } from "lucide-react"

import type { RunState } from "../../harness/run-state"
import { isTerminal } from "../../harness/run-state"

const BADGES: Partial<Record<RunState, { label: string; className: string }>> = {
  preparing_context: { label: "CONTEXT", className: "tw:text-fm-brand-text tw:bg-fm-brand-tint tw:border-fm-brand-line" },
  waiting_for_model: { label: "WAITING", className: "tw:text-fm-brand-text tw:bg-fm-brand-tint tw:border-fm-brand-line" },
  streaming: { label: "STREAMING", className: "tw:text-fm-brand-text tw:bg-fm-brand-tint tw:border-fm-brand-line" },
  waiting_for_tool_approval: { label: "APPROVE", className: "tw:text-fm-pending-text tw:bg-fm-pending-tint tw:border-fm-pending-line" },
  executing_tool: { label: "TOOL", className: "tw:text-fm-vault tw:bg-fm-vault-tint tw:border-fm-vault-line" },
  preparing_answer: { label: "ANSWER", className: "tw:text-fm-brand-text tw:bg-fm-brand-tint tw:border-fm-brand-line" },
  cancelled: { label: "STOPPED", className: "tw:text-fm-text-muted tw:bg-fm-card tw:border-fm-line" },
  failed: { label: "FAILED", className: "tw:text-fm-error-text tw:bg-fm-error-tint tw:border-fm-error-line" },
}

export interface HeaderProps {
  readonly runState: RunState
  readonly elapsedMs: number | null
}

export function Header({ runState, elapsedMs }: HeaderProps) {
  const badge = BADGES[runState]

  return (
    <header className="tw:flex tw:h-11 tw:shrink-0 tw:items-center tw:gap-1.5 tw:pr-2.5 tw:pl-2">
      <span className="tw:text-fm-brand" aria-hidden>
        ◈
      </span>
      {badge && (
        <Badge variant="outline" className={`tw:text-fm-micro tw:font-semibold tw:tracking-wide ${badge.className}`}>
          {badge.label}
        </Badge>
      )}
      {/* Mono, because elapsed time is a machine fact. */}
      {elapsedMs !== null && isTerminal(runState) && (
        <span className="tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      )}
      <span className="tw:flex-1" />
      <button type="button" aria-label="History" className="tw:rounded-fm-control tw:p-1.5 tw:text-fm-text-muted tw:hover:bg-fm-raised">
        <HistoryIcon size={14} />
      </button>
      <button type="button" aria-label="Settings" className="tw:rounded-fm-control tw:p-1.5 tw:text-fm-text-muted tw:hover:bg-fm-raised">
        <SettingsIcon size={14} />
      </button>
    </header>
  )
}
