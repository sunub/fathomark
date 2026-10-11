import type { CitedEvidence } from "../context/evidence";
import type { EditorTarget } from "../context/insertion";
import type { ModelMessage } from "../providers/types";

export interface UserQuestion {
  readonly question: string;
  readonly options?: readonly string[];
}

export interface UserReply {
  readonly questionId: string;
  readonly answerId: string;
  readonly answer: string;
}

export interface CareerState {
  evidence: readonly CitedEvidence[];
  target: EditorTarget | null;
  readonly history: ModelMessage[];
  readonly completedCalls: Map<string, { content: string; name: string; args: string }>;
  readonly toolCounts: Map<string, number>;
  readonly allowedWikipediaPages: Set<string>;
  modelCalls: number;
  toolCalls: number;
  questions: number;
  tokens: number;
  readonly omitted: string[];
}

export const CAREER_LIMITS = { modelCalls: 24, exploreRounds: 8, toolCalls: 12, callsPerTool: 5, questions: 3, pastedBytes: 24_000, answerBytes: 12_000 } as const;
