import { Button } from "@fathomark/design-system"

import type { InsertionPreview } from "../../context/insertion"

interface InsertionPreviewProps {
  readonly preview: InsertionPreview
  readonly busy: boolean
  readonly approve: (id: string) => void
  readonly discard: (id: string) => void
}

export function InsertionPreviewPanel({ preview, busy, approve, discard }: InsertionPreviewProps) {
  return (
    <section className="tw:flex tw:flex-col tw:gap-2 tw:px-3 tw:py-2 tw:text-fm-caption">
      <strong>{preview.path}</strong>
      <div className="tw:grid tw:grid-cols-2 tw:gap-2">
        <pre className="tw:whitespace-pre-wrap">{preview.before}</pre>
        <pre className="tw:whitespace-pre-wrap">{preview.after}</pre>
      </div>
      {preview.status === "stale" && (
        <span className="tw:text-fm-error-text">문서가 바뀌었습니다. 미리보기를 다시 만들어 주세요.</span>
      )}
      {preview.status === "pending" && (
        <div className="tw:flex tw:gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => approve(preview.id)}>
            Approve insertion
          </Button>
          <Button size="sm" variant="outline" onClick={() => discard(preview.id)}>
            Discard insertion
          </Button>
        </div>
      )}
    </section>
  )
}
