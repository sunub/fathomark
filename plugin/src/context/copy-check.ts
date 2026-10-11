/** These literal/copy checks do not establish semantic grounding. */
export function checkStyleCopy(text: string, styleText: string, evidenceText: string): string[] {
  const issues = new Set<string>()
  const literals = styleText.match(/https?:\/\/[^\s]+|\d+(?:[.,]\d+)*(?:\s?(?:%|퍼센트|ms|초|명|개|배|원))?|\b[A-Z][A-Za-z0-9]+\b/g) ?? []
  for (const literal of literals) {
    if (text.includes(literal) && !evidenceText.includes(literal)) {
      issues.add(`style_literal: ${literal}`)
    }
  }

  const normalize = (value: string) => value.replace(/\s+/g, " ").trim()
  const output = normalize(text)
  const evidence = normalize(evidenceText)
  const style = normalize(styleText)
  // Character windows keep the same threshold for Korean and English text.
  for (let index = 0; index + 40 <= style.length; index++) {
    const phrase = style.slice(index, index + 40)
    if (output.includes(phrase) && !evidence.includes(phrase)) {
      issues.add("style_copy: long phrase copied without factual evidence")
    }
  }
  return [...issues]
}
