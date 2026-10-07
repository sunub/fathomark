import { JUDGE_EXCERPT_CHARS, JUDGE_SYSTEM_PROMPT } from "./constant";
import type { OllamaChatReply } from "./type";

export function buildJudgeUserMessage(question: string, excerpt: string): string {
  return `질문: ${question}\n\n<발췌 1>\n${excerpt.slice(0, JUDGE_EXCERPT_CHARS)}\n</발췌 1>`;
}

export function buildJudgeRequestBody(model: string, user: string): string {
  return JSON.stringify({
    model,
    stream: false,
    format: "json",
    think: false,
    options: { temperature: 0, num_ctx: 8192 },
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
  });
}

export function readJudgeReplyContent(reply: OllamaChatReply): string {
  const content = reply.message?.content;
  if (typeof content !== "string") throw new Error("Ollama returned an unexpected judge response.");
  return content;
}

/** A reply that is not the requested JSON is treated as "no": unsupported is the safe answer. */
export function parseJudgeAnswer(content: string): boolean {
  try {
    return (JSON.parse(content) as { answer?: unknown }).answer === "yes";
  } catch {
    return false;
  }
}
