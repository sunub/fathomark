import type { VaultEvidenceReference } from "../../context/evidence";
import { DEFAULT_EXPERIENCE_RULE, type ExperienceRule, isExperienceNote } from "../note-kind";
import { searchVault, type VaultReader, type VaultSearchResult } from "../vault-search";
import {
  CANDIDATES,
  JUDGE_FLOOR,
  JUDGED_CHUNKS,
  JUDGED_DENSE,
  JUDGED_FUSED,
  MAX_EXCERPT_BYTES,
  RRF_K,
  SEMANTIC_SUPPORT_THRESHOLD,
} from "./constant";
import type { SemanticBackend } from "./type";
import { boosted, describe, isAnswerChunk, missingLatinTerms, truncateBytes } from "./utils";

/**
 * Keyword search fused with chunk-embedding search. Without a backend, an empty index,
 * or a working embedder, it returns the keyword result unchanged, so a user without
 * Ollama keeps today's behaviour.
 */
export async function searchHybrid(
  vault: VaultReader,
  query: string,
  limit: number,
  signal: AbortSignal,
  rule: ExperienceRule = DEFAULT_EXPERIENCE_RULE,
  semantic?: SemanticBackend,
): Promise<VaultSearchResult> {
  const keyword = await searchVault(vault, query, CANDIDATES, signal, rule);
  const keywordOnly = (): VaultSearchResult => ({
    ...keyword,
    references: keyword.references.slice(0, limit),
  });
  if (!semantic || semantic.index.noteCount === 0) return keywordOnly();

  let queryVector: number[] | undefined;
  try {
    [queryVector] = await semantic.embedder.embed([query], signal);
  } catch (error) {
    // A Stop the user pressed is not an embedder failure.
    signal.throwIfAborted();
    return {
      ...keywordOnly(),
      omitted: [...keyword.omitted, `semantic search unavailable: ${describe(error)}`],
    };
  }
  if (!queryVector) return keywordOnly();

  const { index } = semantic;
  const hits = index.search(queryVector, isAnswerChunk);
  const experiencePaths = new Set(
    hits
      .filter((hit) => isExperienceNote(hit.path, index.get(hit.path)?.chunks[0]?.text ?? "", rule))
      .map((hit) => hit.path),
  );

  const dense = [...hits]
    .sort((left, right) => boosted(right, experiencePaths) - boosted(left, experiencePaths))
    .slice(0, CANDIDATES);
  const fused = new Map<string, number>();
  dense.forEach((hit, rank) =>
    fused.set(hit.path, (fused.get(hit.path) ?? 0) + 1 / (RRF_K + rank + 1)),
  );
  keyword.references.forEach((reference, rank) =>
    fused.set(reference.path, (fused.get(reference.path) ?? 0) + 1 / (RRF_K + rank + 1)),
  );
  const fusedOrder = [...fused.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([path]) => path);

  // Only experience notes can support an answer, unless the vault has none to judge by.
  const experienceHits = hits.filter((hit) => experiencePaths.has(hit.path));
  const pool = experienceHits.length > 0 ? experienceHits : hits;
  const missing = missingLatinTerms(
    query,
    pool.map((hit) => index.get(hit.path)),
  );

  let judged: { readonly confirmed: readonly string[] } | null = null;
  let judgeOmitted: string | null = null;
  if (semantic.judge && missing.length === 0 && (hits[0]?.score ?? 0) >= JUDGE_FLOOR) {
    const candidates = [
      ...new Set([
        ...fusedOrder.slice(0, JUDGED_FUSED),
        ...hits.slice(0, JUDGED_DENSE).map((hit) => hit.path),
      ]),
    ];
    try {
      const confirmed: string[] = [];
      for (const path of candidates) {
        const excerpt = index
          .topChunks(path, queryVector, JUDGED_CHUNKS, isAnswerChunk)
          .join("\n...\n");
        if (excerpt !== "" && (await semantic.judge.supports(query, excerpt, signal)))
          confirmed.push(path);
      }
      judged = { confirmed };
    } catch (error) {
      // A Stop the user pressed is not a judge failure.
      signal.throwIfAborted();
      judgeOmitted = `evidence judge unavailable: ${describe(error)}`;
    }
  }

  const confirmed = judged?.confirmed ?? [];
  const order = [...confirmed, ...fusedOrder.filter((path) => !confirmed.includes(path))].slice(
    0,
    limit,
  );
  const omitted = judgeOmitted ? [...keyword.omitted, judgeOmitted] : keyword.omitted;

  const chunkByPath = new Map(hits.map((hit) => [hit.path, hit.text]));
  const keywordByPath = new Map(keyword.references.map((reference) => [reference.path, reference]));
  const references = order.flatMap((path): VaultEvidenceReference[] => {
    const chunk = chunkByPath.get(path);
    if (chunk !== undefined)
      return [{ kind: "vault", path, excerpt: truncateBytes(chunk, MAX_EXCERPT_BYTES) }];
    const fromKeyword = keywordByPath.get(path);
    return fromKeyword ? [fromKeyword] : [];
  });

  // Without a verdict (no judge, a failed judge, or a question the gate or the floor already ruled out)
  // the threshold decides; the floor is below the threshold, so it needs no separate check here.
  const supported = judged
    ? confirmed.length > 0
    : missing.length === 0 && (pool[0]?.score ?? 0) >= SEMANTIC_SUPPORT_THRESHOLD;
  if (!supported) return { references, omitted, supported: false, reason: "below_threshold" };
  return { references, omitted, supported: true };
}
