import type { VaultEvidenceReference } from "../context/evidence";
import type { NoteSummary } from "../obsidian/vault-adapter";
import { DEFAULT_EXPERIENCE_RULE, type ExperienceRule, isExperienceNote } from "./note-kind";

export interface VaultReader {
  listNotes(): NoteSummary[];
  readNote(path: string): Promise<string | null>;
}

const MAX_NOTES = 1_000;
const MAX_EXCERPT_BYTES = 4_096;
const READ_CONCURRENCY = 4;
const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/;
/** Per-term score multiplier for experience notes. Set to the smallest whole number that passes the S2 opinion-vs-experience test; the S2 measurement may move it. */
const EXPERIENCE_WEIGHT = 3;
const HEADING_WEIGHT = 2;
/** Share of the question's weight the best note must cover to count as evidence. An unvalidated first value; S2's held-out run is the check. */
const SUPPORT_THRESHOLD = 0.5;

interface RankedReference {
  readonly score: number;
  readonly coverage: number;
  readonly reference: VaultEvidenceReference;
}

export interface VaultSearchResult {
  readonly references: VaultEvidenceReference[];
  readonly omitted: string[];
  /** False when the notes do not cover the question well enough to cite; references may still hold the closest notes. */
  readonly supported: boolean;
  readonly reason?: "no_match" | "below_threshold";
}

export async function searchVault(
  vault: VaultReader,
  query: string,
  limit: number,
  signal: AbortSignal,
  rule: ExperienceRule = DEFAULT_EXPERIENCE_RULE,
): Promise<VaultSearchResult> {
  const allNotes = vault.listNotes();
  const notes = allNotes.slice(0, MAX_NOTES);
  const omitted =
    allNotes.length > MAX_NOTES ? [`Only the first ${MAX_NOTES} notes were searched.`] : [];
  const terms = words(query);

  const { candidates, readCount } = await readCandidates(
    vault,
    notes,
    terms,
    rule,
    signal,
    omitted,
  );
  // IDF needs the document frequency of every term, so scoring waits until all notes are read.
  const idf = inverseDocumentFrequency(terms, candidates, readCount);
  const required = minShouldMatch(terms.length);

  const ranked: RankedReference[] = [];
  for (const candidate of candidates) {
    if (candidate.matches.length < required) continue;
    const reference = excerptReference(candidate, terms, omitted);
    if (reference) {
      ranked.push({
        score: scoreCandidate(candidate, idf),
        coverage: coverage(candidate, terms, idf, readCount),
        reference,
      });
    }
  }
  ranked.sort(
    (left, right) =>
      right.score - left.score || left.reference.path.localeCompare(right.reference.path),
  );
  const references = ranked.slice(0, limit).map((item) => item.reference);
  if (ranked.length === 0) return { references, omitted, supported: false, reason: "no_match" };
  const best = Math.max(...ranked.map((item) => item.coverage));
  // The epsilon keeps exactly-half coverage from failing on float rounding.
  if (best + 1e-9 < SUPPORT_THRESHOLD)
    return { references, omitted, supported: false, reason: "below_threshold" };
  return { references, omitted, supported: true };
}

/** Reads every note with bounded concurrency and keeps those that match at least one term. */
async function readCandidates(
  vault: VaultReader,
  notes: readonly NoteSummary[],
  terms: readonly string[],
  rule: ExperienceRule,
  signal: AbortSignal,
  omitted: string[],
): Promise<{ candidates: Candidate[]; readCount: number }> {
  const candidates: Candidate[] = [];
  let readCount = 0;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      signal.throwIfAborted();
      const note = notes[nextIndex++];
      if (!note) return;
      const content = await vault.readNote(note.path);
      signal.throwIfAborted();
      if (content === null) {
        omitted.push(`${note.path}: note disappeared during search`);
        continue;
      }
      readCount += 1;
      const matches = matchTerms(note, content, terms);
      if (matches.length > 0) {
        candidates.push({
          note,
          content,
          matches,
          experience: isExperienceNote(note.path, content, rule),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: READ_CONCURRENCY }, () => worker()));
  return { candidates, readCount };
}

/** `ln(notes read / notes containing the term) + 1`, so common words weigh less. */
function inverseDocumentFrequency(
  terms: readonly string[],
  candidates: readonly Candidate[],
  readCount: number,
): Map<string, number> {
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = candidates.filter((item) =>
      item.matches.some((match) => match.term === term),
    ).length;
    if (df > 0) idf.set(term, Math.log(readCount / df) + 1);
  }
  return idf;
}

/**
 * Share of the question's IDF weight a note matches. A question word found in no note
 * counts as if it were in one note, i.e. the rarest possible word, so missing words hurt most.
 */
function coverage(
  candidate: Candidate,
  terms: readonly string[],
  idf: ReadonlyMap<string, number>,
  readCount: number,
): number {
  const weightOf = (term: string) => idf.get(term) ?? Math.log(readCount) + 1;
  const total = terms.reduce((sum, term) => sum + weightOf(term), 0);
  const matched = candidate.matches.reduce((sum, match) => sum + weightOf(match.term), 0);
  return total === 0 ? 0 : matched / total;
}

function scoreCandidate(candidate: Candidate, idf: ReadonlyMap<string, number>): number {
  const score = candidate.matches.reduce(
    (sum, match) => sum + (idf.get(match.term) ?? 0) * match.weight,
    0,
  );
  return candidate.experience ? score * EXPERIENCE_WEIGHT : score;
}

/** First paragraph whose text or heading contains a term, or null when none fits the excerpt limit (reason goes to `omitted`). */
function excerptReference(
  { note, content }: Candidate,
  terms: readonly string[],
  omitted: string[],
): VaultEvidenceReference | null {
  const paragraph = paragraphs(content).find((item) =>
    containsTerm(`${item.heading ?? ""}\n${item.text}`, terms),
  );
  if (!paragraph) return null;
  if (utf8Bytes(paragraph.text) > MAX_EXCERPT_BYTES) {
    omitted.push(`${note.path}: matching paragraph exceeds ${MAX_EXCERPT_BYTES} UTF-8 bytes`);
    return null;
  }
  return {
    kind: "vault",
    path: note.path,
    ...(paragraph.heading ? { heading: paragraph.heading } : {}),
    excerpt: paragraph.text,
  };
}

export function excerptForHeading(
  content: string,
  heading?: string,
): { excerpt: string | null; heading?: string; omitted: string[] } {
  const normalizedHeading = heading ? normalize(heading) : null;
  const available = paragraphs(content).filter((item) =>
    normalizedHeading === null ? true : normalize(item.heading ?? "") === normalizedHeading,
  );
  if (heading && available.length === 0) {
    return { excerpt: null, heading, omitted: [`heading not found: ${heading}`] };
  }
  const selected: string[] = [];
  const omitted: string[] = [];
  for (const paragraph of available) {
    const next = [...selected, paragraph.text].join("\n\n");
    if (utf8Bytes(paragraph.text) > MAX_EXCERPT_BYTES) {
      omitted.push(`paragraph exceeds ${MAX_EXCERPT_BYTES} UTF-8 bytes`);
      continue;
    }
    if (utf8Bytes(next) > MAX_EXCERPT_BYTES) {
      omitted.push("additional paragraphs omitted by the 4096 UTF-8 byte limit");
      break;
    }
    selected.push(paragraph.text);
  }
  return {
    excerpt: selected.length > 0 ? selected.join("\n\n") : null,
    ...(heading ? { heading: available[0]?.heading ?? heading.trim() } : {}),
    omitted,
  };
}

interface TermMatch {
  readonly term: string;
  /** 3 for a title hit, 2 for a heading hit, 1 for a body hit; summed. */
  readonly weight: number;
}

interface Candidate {
  readonly note: NoteSummary;
  readonly content: string;
  readonly matches: readonly TermMatch[];
  readonly experience: boolean;
}

function matchTerms(note: NoteSummary, content: string, terms: readonly string[]): TermMatch[] {
  const title = normalize(note.title);
  const headings = normalize(headingsOf(content).join("\n"));
  const body = normalize(content);
  return terms.flatMap((term) => {
    const weight =
      (title.includes(term) ? 3 : 0) +
      (headings.includes(term) ? HEADING_WEIGHT : 0) +
      (body.includes(term) ? 1 : 0);
    return weight > 0 ? [{ term, weight }] : [];
  });
}

function headingsOf(content: string): string[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const heading = HEADING_LINE.exec(line)?.[2];
    return heading ? [heading] : [];
  });
}

/** Minimum should match: 1-2 words need 1, 3-4 need 2, 5+ need half. */
function minShouldMatch(termCount: number): number {
  if (termCount <= 2) return 1;
  if (termCount <= 4) return 2;
  return Math.floor(termCount * 0.5);
}

/** Sentence punctuation around a word. `+`, `#` and inner dots are left alone so "c++" and "node.js" survive. */
const EDGE_PUNCTUATION = /^[\s"'“”‘’([{<]+|[\s.,?!;:"'“”‘’)\]}>…？！，。]+$/gu;

function words(value: string): string[] {
  const all = [
    ...new Set(
      normalize(value)
        .split(/\s+/)
        .map((term) => term.replace(EDGE_PUNCTUATION, ""))
        .filter(Boolean)
        .map(stripVerbEnding)
        .map(stripParticle),
    ),
  ];
  const topical = all.filter((term) => !QUESTION_FRAME.has(term));
  // A question made only of frame words still has to search for something.
  return topical.length > 0 ? topical : all;
}

/**
 * Words of the form "describe your experience of X" that say nothing about X. Every career
 * question carries them, so counting them would lower coverage for no reason. Matched after
 * particles are stripped ("경험을" arrives here as "경험").
 */
const QUESTION_FRAME = new Set([
  "경험",
  "설명",
  "설명해",
  "설명하세요",
  "서술",
  "서술해",
  "서술하세요",
  "말씀",
  "말씀해",
  "말씀하세요",
  "주세요",
  "있나요",
  "있었나요",
  "있습니까",
]);

/** Longest first, so "에서" is tried before the one-syllable particles. */
const PARTICLES = [
  "에서는",
  "으로는",
  "에게서",
  "에서",
  "으로",
  "에게",
  "까지",
  "부터",
  "처럼",
  "보다",
  "만의",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "도",
  "로",
  "와",
  "과",
  "만",
];

/** Endings of 하다-verbs ("도입한", "도입해"). Native verbs such as "이끈" change their stem and are not handled. */
const VERB_ENDINGS = ["하세요", "했던", "하는", "하여", "하고", "하며", "한", "할", "해"];

/** Same one-syllable protection as `stripParticle`: "위한" stays whole. */
function stripVerbEnding(term: string): string {
  if (!/[가-힣]$/.test(term)) return term;
  const ending = VERB_ENDINGS.find((item) => term.length - item.length >= 2 && term.endsWith(item));
  return ending ? term.slice(0, -ending.length) : term;
}

/**
 * Drops one trailing particle from a Hangul word so "성능을" can match "성능" in a note.
 * A word is left whole when the remaining stem would be a single syllable ("아이" must not become "아").
 */
function stripParticle(term: string): string {
  if (!/[가-힣]$/.test(term)) return term;
  const particle = PARTICLES.find((item) => term.length - item.length >= 2 && term.endsWith(item));
  return particle ? term.slice(0, -particle.length) : term;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

function containsTerm(value: string, terms: readonly string[]): boolean {
  const normalized = normalize(value);
  return terms.some((term) => normalized.includes(term));
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function paragraphs(content: string): Array<{ heading?: string; text: string }> {
  const result: Array<{ heading?: string; text: string }> = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) result.push({ ...(heading ? { heading } : {}), text });
    lines = [];
  };
  for (const line of content.split(/\r?\n/)) {
    const match = HEADING_LINE.exec(line);
    if (match) {
      flush();
      heading = match[2]?.normalize("NFKC").trim();
    } else if (line.trim() === "") {
      flush();
    } else {
      lines.push(line);
    }
  }
  flush();
  return result;
}
