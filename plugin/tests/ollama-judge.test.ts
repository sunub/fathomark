import { describe, expect, it } from "vitest"

import { createOllamaJudge, JUDGE_EXCERPT_CHARS } from "../src/providers/ollama-judge"

const signal = new AbortController().signal

function replying(content: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify({ message: { content } }), { status })) as unknown as typeof fetch
}

describe("createOllamaJudge", () => {
  it("reads yes and no from the JSON answer", async () => {
    expect(await createOllamaJudge("http://127.0.0.1:11434", "m", replying('{"answer":"yes"}')).supports("q", "e", signal)).toBe(true)
    expect(await createOllamaJudge("http://127.0.0.1:11434", "m", replying('{"answer":"no"}')).supports("q", "e", signal)).toBe(false)
  })

  it("treats a reply that is not the requested JSON as no", async () => {
    expect(await createOllamaJudge("http://127.0.0.1:11434", "m", replying("yes")).supports("q", "e", signal)).toBe(false)
  })

  it("posts a deterministic JSON chat with the excerpt fenced and truncated", async () => {
    let body: { model?: string; format?: string; options?: { temperature?: number }; messages?: { content: string }[] } = {}
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      expect(url.toString()).toBe("http://localhost:11434/api/chat")
      body = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ message: { content: '{"answer":"no"}' } }))
    }) as unknown as typeof fetch
    await createOllamaJudge("http://localhost:11434", "gemma4:e4b", fetchImpl).supports("질문", "가".repeat(2_000), signal)
    expect(body.model).toBe("gemma4:e4b")
    expect(body.format).toBe("json")
    expect(body.options?.temperature).toBe(0)
    const user = body.messages?.[1]?.content ?? ""
    expect(user).toContain("<발췌 1>")
    expect(user.match(/가/g)).toHaveLength(JUDGE_EXCERPT_CHARS)
  })

  it("refuses a provider that is not on a loopback address", () => {
    expect(() => createOllamaJudge("http://example.com:11434")).toThrow(/loopback/)
  })

  it("rejects a failed or malformed response", async () => {
    await expect(createOllamaJudge("http://127.0.0.1:11434", "m", replying("", 500)).supports("q", "e", signal)).rejects.toThrow(/500/)
    await expect(createOllamaJudge("http://127.0.0.1:11434", "m", replying(42)).supports("q", "e", signal)).rejects.toThrow(/unexpected/)
  })
})
