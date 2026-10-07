/**
 * Decides whether a note excerpt is the writer's own experience that answers the question.
 * Similarity cannot tell "I did X" from "I want to do X" or "my teammate did X"; reading can.
 */
export interface EvidenceJudge {
  readonly model: string;
  supports(question: string, excerpt: string, signal: AbortSignal): Promise<boolean>;
}

/** The part of Ollama's `/api/chat` reply the judge reads. */
export interface OllamaChatReply {
  readonly message?: { readonly content?: unknown };
}
