import type { ResearchTopic } from "../context/packet"

export function createResearchTopic(text: string, language: "ko" | "en"): ResearchTopic {
  if (language !== "ko" && language !== "en") throw new Error("Research language must be ko or en.")
  const value = text.normalize("NFKC").trim()
  if (value.length < 1 || value.length > 120) {
    throw new Error("A public research topic must contain 1 to 120 characters.")
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) throw new Error("Control characters are not allowed.")
  if (/\b(?:https?:\/\/|www\.)/i.test(value) || /[\\/]/.test(value) || /\.md\b/i.test(value)) {
    throw new Error("URLs and file paths are not public research topics.")
  }
  return { id: `topic-${fnv1a(`${language}:${value}`)}`, text: value, language }
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}
