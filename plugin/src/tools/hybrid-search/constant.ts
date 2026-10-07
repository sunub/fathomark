/** Notes taken from each ranking before they are fused. */
export const CANDIDATES = 50;
/** Reciprocal Rank Fusion constant. 60 is the value from the RRF paper. */
export const RRF_K = 60;
/** Added to an experience note's similarity when ranking, so opinion notes do not outrank it on a near tie. */
export const EXPERIENCE_BOOST = 0.03;
/**
 * Best-chunk cosine similarity an experience note must reach for the question to count as supported,
 * when no judge is configured. Measured on a 40-question development set (28 answerable, 12 without
 * evidence): 0.58 blocked 10 of 12 and wrongly blocked 2 of 28; 0.60 blocked 11 of 12 and wrongly blocked 6 of 28.
 */
export const SEMANTIC_SUPPORT_THRESHOLD = 0.58;
/** The judge reads the top of the fused ranking plus the top of the embedding ranking, which keyword ranks can push out. */
export const JUDGED_FUSED = 6;
export const JUDGED_DENSE = 3;
/** Chunks of one note the judge reads together. */
export const JUDGED_CHUNKS = 2;
/** Below this best-chunk similarity nothing in the vault is close enough to be worth asking the judge about. */
export const JUDGE_FLOOR = 0.45;
export const MAX_EXCERPT_BYTES = 4_096;

/**
 * Application-form boilerplate ("700자 이내", "~경험을 기술해 주세요", a question line). Cover-letter notes
 * keep the company's question next to the answer, and a question-shaped query matches that question
 * better than any answer, pushing the answers out. On the development sets, leaving them out moved
 * real answers into the judge's candidates and changed no metric of the threshold-only path.
 */
export const APPLICATION_PROMPT_LINE =
  /\d[\d,]*\s*자\s*(이내|입력|내외)|최[대소]\s*\d|(작성|기술|기재|소개|설명|서술|이야기)해\s*주(세요|십시오|시기)|적어\s*주(세요|십시오)|\?\s*$|\?\s*\(|^\s*\**\d+\s*\**\s*\/\s*\d+/;

export const LATIN_TERM = /[A-Za-z][A-Za-z0-9+#.]{2,}/g;
export const LATIN_WORD = /[a-z][a-z0-9+#.]*[a-z0-9+#]|[a-z]/g;
