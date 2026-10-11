import type { EvidenceReference } from "../../context/evidence"
import type { EvidenceConflictClaim } from "../../harness/events"

interface SourcesProps {
  readonly answer: string
  readonly evidence: ReadonlyMap<string, EvidenceReference>
  readonly conflicts: readonly EvidenceConflictClaim[]
  readonly openSource: (reference: EvidenceReference) => Promise<void>
}

export function Sources({ answer, evidence, conflicts, openSource }: SourcesProps) {
  const cited = [...answer.matchAll(/\[\[(S\d+)\]\]/g)].map((match) => match[1]!)
  const unknown = [...new Set(cited.filter((sourceId) => !evidence.has(sourceId)))]
  return (
    <div className="tw:flex tw:flex-col tw:gap-1 tw:px-3 tw:py-2 tw:text-fm-caption">
      {[...evidence].map(([sourceId, reference]) => reference.kind === "user" || reference.kind === "public" ? (
        <div key={sourceId}>
          <span>{sourceId} · {sourceLabel(reference)}</span>
          <p className="tw:whitespace-pre-wrap tw:text-fm-text-muted">{reference.excerpt}</p>
        </div>
      ) : (
          <button
            type="button"
            key={sourceId}
            className="tw:text-left tw:text-fm-brand-text"
            aria-label={sourceLabel(reference)}
            onClick={() => void openSource(reference)}
          >
            {sourceId} · {sourceLabel(reference)}
          </button>
        ))}
      {unknown.map((sourceId) => (
        <span key={sourceId}>Unverified citation {sourceId}</span>
      ))}
      {conflicts.map((claim, index) => (
        <span key={`${claim.claim}-${index}`}>
          {claim.claim} · {sourceLabel(claim.reference)}
        </span>
      ))}
    </div>
  )
}

function sourceLabel(reference: EvidenceReference): string {
  switch (reference.kind) {
    case "vault":
      return `${reference.path}${reference.heading ? `#${reference.heading}` : ""}`
    case "user":
      return "사용자 보충 답변"
    case "public":
      return `${reference.title} · 공개 참고 자료`
    case "external":
      return reference.title
  }
}
