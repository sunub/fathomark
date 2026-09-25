/*
 * The budget bar. Chat/Anatomy fixes its shape: mono `used / total`, a bar
 * split by what is filling it, and the reserve label on the right.
 *
 * It sits directly above the composer because "you are over budget" and "so
 * what do I drop" have to be in one glance.
 */

import type { BudgetUsage } from "../../harness/events"

const SEGMENTS = [
  // The evidence colours doing what they always do: where did this come from?
  { key: "instructions", className: "tw:bg-fm-brand" },
  { key: "vault", className: "tw:bg-fm-vault" },
  { key: "external", className: "tw:bg-fm-external" },
  { key: "conversation", className: "tw:bg-fm-line-strong" },
  { key: "toolSchemas", className: "tw:bg-fm-text-faint" },
] as const

function thousands(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)
}

export function BudgetBar({ usage }: { usage: BudgetUsage }) {
  const used =
    usage.instructions + usage.vault + usage.external + usage.conversation + usage.toolSchemas

  return (
    <div className="tw:flex tw:items-center tw:gap-2 tw:font-fm-mono tw:text-fm-micro tw:text-fm-text-muted">
      <span>
        {thousands(used)} / {thousands(usage.total)}
      </span>
      <span className="tw:flex tw:h-1 tw:flex-1 tw:overflow-hidden tw:rounded-xs tw:bg-fm-line">
        {SEGMENTS.map(({ key, className }) => (
          <span
            key={key}
            className={className}
            style={{ width: `${(usage[key] / usage.total) * 100}%` }}
          />
        ))}
      </span>
      <span>reserve {thousands(usage.outputReserve)}</span>
    </div>
  )
}
