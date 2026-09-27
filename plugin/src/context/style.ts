import type { SelectedStyle } from "./packet"

export class SelectedStyleStore {
  private value: SelectedStyle | null

  constructor(
    private readonly save: (style: SelectedStyle | null) => Promise<void>,
    initial: SelectedStyle | null = null
  ) {
    this.value = initial
  }

  get(): SelectedStyle | null {
    return this.value
  }

  select(text: string): void {
    this.value = createSelectedStyle(text)
  }

  clear(): void {
    this.value = null
  }

  async persist(): Promise<void> {
    await this.save(this.value)
  }
}

export function createSelectedStyle(text: string): SelectedStyle {
  if (!text.trim()) throw new Error("The style selection is empty.")
  const bytes = new TextEncoder().encode(text).length
  if (bytes > 4_096) throw new Error("The style selection must be at most 4096 UTF-8 bytes.")
  return { id: `style-${fnv1a(text)}`, text }
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}
