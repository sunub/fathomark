import { validateLocalProviderUrl } from "../ollama";
import { DEFAULT_JUDGE_MODEL } from "./constant";
import type { EvidenceJudge, OllamaChatReply } from "./type";
import {
  buildJudgeRequestBody,
  buildJudgeUserMessage,
  parseJudgeAnswer,
  readJudgeReplyContent,
} from "./utils";

export function createOllamaJudge(
  baseUrl: string,
  model: string = DEFAULT_JUDGE_MODEL,
  fetchImpl: typeof fetch = fetch,
): EvidenceJudge {
  const base = validateLocalProviderUrl(baseUrl);
  return {
    model,
    async supports(question, excerpt, signal) {
      const response = await fetchImpl(new URL("/api/chat", base), {
        method: "POST",
        signal,
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: buildJudgeRequestBody(model, buildJudgeUserMessage(question, excerpt)),
      });
      if (!response.ok) throw new Error(`Ollama judge request failed with ${response.status}.`);
      const reply = (await response.json()) as OllamaChatReply;
      return parseJudgeAnswer(readJudgeReplyContent(reply));
    },
  };
}
