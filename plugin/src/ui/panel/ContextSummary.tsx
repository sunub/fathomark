import type { CurrentNoteContext } from "../../context/packet"

export function ContextSummary({ note }: { readonly note: CurrentNoteContext | null }) {
  return (
    <div className="tw:px-3 tw:py-1 tw:text-fm-caption tw:text-fm-text-muted">
      {note ? `${note.path} · ${note.isSelection ? "selection" : "full note"}` : "No note captured"}
    </div>
  )
}
