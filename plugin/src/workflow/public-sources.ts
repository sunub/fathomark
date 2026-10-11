import type { PublicSourceReader } from "../tools/read-public-source";
import { CAREER_LIMITS } from "./state";

/** A fresh reader per request. A model can name P1, never replace its contents. */
export function pastedSourceReader(text = ""): PublicSourceReader {
  if (new TextEncoder().encode(text).length > CAREER_LIMITS.pastedBytes) {
    throw new Error(`붙여넣기 자료는 ${CAREER_LIMITS.pastedBytes} UTF-8 바이트 이하로 입력해주세요.`);
  }
  const source = text.trim() ? { title: "사용자가 제공한 공고", text, collectedAt: new Date().toISOString() } : null;
  return { read: async (id) => id === "P1" ? source : null };
}
