import type { Embedder } from "../../providers/ollama-embedder";
import type { EvidenceJudge } from "../../providers/ollama-judge";
import type { VectorIndex } from "../../retrieval/vector-index";

export interface SemanticBackend {
  readonly index: VectorIndex;
  readonly embedder: Embedder;
  /**
   * Optional. With a judge, a question is supported only when a candidate note reads as the
   * writer's own experience answering it, and those notes rank first. Without one, the
   * similarity threshold decides.
   */
  readonly judge?: EvidenceJudge;
}
