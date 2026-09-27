import { useState } from "react"

import { Button } from "@fathomark/design-system"

interface StylePickerProps {
  readonly selectStyle: () => Promise<void>
  readonly clearStyle: () => Promise<void>
  readonly saveStyle: () => Promise<void>
}

export function StylePicker({ selectStyle, clearStyle, saveStyle }: StylePickerProps) {
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:px-3 tw:text-fm-caption">
      <Button variant="outline" size="sm" onClick={() => void run(selectStyle)}>
        Use current selection as style
      </Button>
      <Button variant="outline" size="sm" onClick={() => void run(saveStyle)}>
        Save style
      </Button>
      <Button variant="outline" size="sm" onClick={() => void run(clearStyle)}>
        Clear style
      </Button>
      {error && <span className="tw:text-fm-error-text">{error}</span>}
    </div>
  )
}
