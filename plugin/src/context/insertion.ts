export interface EditorPosition {
  readonly line: number
  readonly ch: number
}

export interface EditorTarget {
  readonly id: string
  readonly path: string
  readonly text: string
  readonly selection: string
  readonly from: EditorPosition
  readonly to: EditorPosition
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
