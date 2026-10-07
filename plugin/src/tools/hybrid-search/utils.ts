import { APPLICATION_PROMPT_LINE, EXPERIENCE_BOOST, LATIN_TERM, LATIN_WORD } from "./constant";

export function boosted(
  hit: { readonly path: string; readonly score: number },
  experiencePaths: ReadonlySet<string>,
): number {
  return hit.score + (experiencePaths.has(hit.path) ? EXPERIENCE_BOOST : 0);
}

/** False for a chunk whose text is mostly application-form question lines. */
export function isAnswerChunk(text: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  if (total === 0) return false;
  const prompt = lines
    .filter((line) => APPLICATION_PROMPT_LINE.test(line))
    .reduce((sum, line) => sum + line.length, 0);
  return prompt / total <= 0.5;
}

/**
 * Latin technical words in the question (`Kafka`, `Django`) that appear in none of the pool's
 * notes. A tool the user never wrote about is not experience they have, however close the
 * surrounding Korean sounds. Whole words only: "boot" must not be found inside "bootcamp".
 */
export function missingLatinTerms(
  query: string,
  notes: ReadonlyArray<{ readonly chunks: ReadonlyArray<{ readonly text: string }> } | undefined>,
): string[] {
  const terms = [
    ...new Set(
      (query.match(LATIN_TERM) ?? []).map((term) => term.toLowerCase().replace(/\.+$/, "")),
    ),
  ];
  if (terms.length === 0) return [];
  const present = new Set<string>();
  for (const note of notes) {
    for (const chunk of note?.chunks ?? []) {
      for (const word of chunk.text.toLowerCase().match(LATIN_WORD) ?? []) present.add(word);
    }
  }
  return terms.filter((term) => !present.has(term));
}


export function truncateBytes(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  let end = value.length;
  while (end > 0 && encoder.encode(value.slice(0, end)).length > maxBytes) end -= 64;
  return value.slice(0, Math.max(end, 0));
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
