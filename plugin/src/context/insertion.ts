export interface EditorPosition {
  readonly line: number
  readonly ch: number
}

export interface InsertionPreview {
  readonly id: string
  readonly targetId: string
  readonly path: string
  readonly from: EditorPosition
  readonly to: EditorPosition
  readonly before: string
  readonly after: string
  readonly status: "pending" | "applied" | "discarded" | "stale"
}
