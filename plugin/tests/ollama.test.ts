import { describe, expect, it, vi } from "vitest"

import { decodeNdjson } from "../src/providers/ndjson"
import { createOllamaProvider, validateLocalProviderUrl } from "../src/providers/ollama"
import type { ModelRequest } from "../src/providers/types"

const encoder = new TextEncoder()

function streamBytes(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function response(lines: readonly unknown[], init: ResponseInit = {}): Response {
  return new Response(
    streamBytes(lines.map((line) => encoder.encode(`${JSON.stringify(line)}\n`))),
    { status: 200, ...init }
  )
}

const request: ModelRequest = {
  model: "qwen3",
  messages: [{ role: "user", content: "안녕" }],
  tools: [{ name: "read_note", description: "Read", parameters: { type: "object" } }],
  maxOutputTokens: 128,
  contextWindow: 4_096,
}

describe("NDJSON decoding", () => {
  it("preserves a Korean character split across byte chunks", async () => {
    const bytes = encoder.encode('{"message":{"content":"한"}}\n')
    const values = []
    for await (const value of decodeNdjson(
      streamBytes([...bytes].map((byte) => new Uint8Array([byte]))),
      new AbortController().signal
    )) {
      values.push(value)
    }
    expect(values).toEqual([{ message: { content: "한" } }])
  })

  it("rejects malformed JSON", async () => {
    const collect = async () => {
      for await (const _value of decodeNdjson(
        streamBytes([encoder.encode("{bad}\n")]),
        new AbortController().signal
      )) {
        // consume
      }
    }
    await expect(collect()).rejects.toThrow(/invalid NDJSON/i)
  })

  it("cancels an active reader when aborted", async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => {})
      },
      cancel,
    })
    const controller = new AbortController()
    const collect = async () => {
      for await (const _value of decodeNdjson(body, controller.signal)) {
        // consume
      }
    }
    const running = collect()
    controller.abort(new DOMException("stop", "AbortError"))
    await expect(running).rejects.toMatchObject({ name: "AbortError" })
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe("Ollama provider", () => {
  it("keeps models unusable until native tools, context, template, and budget are proven", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const path = new URL(String(url)).pathname
      if (path === "/api/tags") {
        return Response.json({ models: [{ name: "qwen3", digest: "sha256:model" }] })
      }
      return Response.json({
        capabilities: ["completion", "tools"],
        template: "{{ .Messages }}",
        model_info: { "qwen3.context_length": 8_192, "tokenizer.ggml.model": "gpt2" },
      })
    }) as unknown as typeof fetch

    const models = await createOllamaProvider("http://127.0.0.1:11434", fetchImpl).listModels(
      new AbortController().signal
    )

    expect(models).toEqual([
      {
        id: "qwen3",
        label: "qwen3",
        supportsTools: true,
        contextLength: 8_192,
        usable: false,
        reason: "No verified tokenizer budget profile matches this installation.",
      },
    ])
  })

  it("preserves multiple native tool calls and object arguments", async () => {
    const fetchImpl = vi.fn(async () =>
      response([
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              { function: { name: "read_note", arguments: { path: "a.md" } } },
              { function: { name: "read_note", arguments: { path: "b.md" } } },
            ],
          },
          done: true,
          done_reason: "stop",
        },
      ])
    ) as unknown as typeof fetch
    const events = []
    for await (const event of createOllamaProvider("http://127.0.0.1:11434", fetchImpl).stream(
      request,
      new AbortController().signal
    )) {
      events.push(event)
    }

    expect(events.filter((event) => event.type === "tool_call")).toEqual([
      { type: "tool_call", call: { callId: "ollama-1-0", name: "read_note", args: { path: "a.md" } } },
      { type: "tool_call", call: { callId: "ollama-1-1", name: "read_note", args: { path: "b.md" } } },
    ])
    expect(events.at(-1)).toEqual({ type: "done", reason: "tool_calls" })
  })

  it("keeps text that looks like JSON as prose", async () => {
    const fetchImpl = vi.fn(async () =>
      response([{ message: { content: '{"name":"read_note"}' }, done: true, done_reason: "stop" }])
    ) as unknown as typeof fetch
    const events = []
    for await (const event of createOllamaProvider("http://localhost:11434", fetchImpl).stream(
      request,
      new AbortController().signal
    )) {
      events.push(event)
    }
    expect(events).toContainEqual({ type: "text", delta: '{"name":"read_note"}' })
    expect(events.some((event) => event.type === "tool_call")).toBe(false)
  })

  it("rejects EOF without a done object", async () => {
    const fetchImpl = vi.fn(async () => response([{ message: { content: "partial" }, done: false }])) as unknown as typeof fetch
    const collect = async () => {
      for await (const _event of createOllamaProvider("http://[::1]:11434", fetchImpl).stream(
        request,
        new AbortController().signal
      )) {
        // consume
      }
    }
    await expect(collect()).rejects.toThrow(/without done/i)
  })

  it("rejects non-success HTTP and redirects", async () => {
    const failing = vi.fn(async () => new Response('{"error":"missing"}', { status: 404 })) as unknown as typeof fetch
    const redirected = vi.fn(async () => {
      const result = new Response("{}", { status: 200 })
      Object.defineProperty(result, "redirected", { value: true })
      return result
    }) as unknown as typeof fetch
    const collect = async (fetchImpl: typeof fetch) => {
      for await (const _event of createOllamaProvider("http://127.0.0.1:11434", fetchImpl).stream(
        request,
        new AbortController().signal
      )) {
        // consume
      }
    }
    await expect(collect(failing)).rejects.toThrow(/404.*missing/i)
    await expect(collect(redirected)).rejects.toThrow(/redirect/i)
  })

  it("passes abort to fetch", async () => {
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
      })
    }) as unknown as typeof fetch
    const controller = new AbortController()
    const collect = async () => {
      for await (const _event of createOllamaProvider("http://127.0.0.1:11434", fetchImpl).stream(
        request,
        controller.signal
      )) {
        // consume
      }
    }
    const running = collect()
    controller.abort(new DOMException("stop", "AbortError"))
    await expect(running).rejects.toMatchObject({ name: "AbortError" })
  })

  it("links assistant calls and tool results using the official tool_name field", async () => {
    let body: unknown
    const fetchImpl = vi.fn(async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return response([{ message: { content: "done" }, done: true, done_reason: "stop" }])
    }) as unknown as typeof fetch
    const continued: ModelRequest = {
      ...request,
      messages: [
        { role: "user", content: "read" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ callId: "c1", name: "read_note", args: { path: "a.md" } }],
        },
        { role: "tool", callId: "c1", content: "result" },
      ],
    }

    for await (const _event of createOllamaProvider("http://127.0.0.1:11434", fetchImpl).stream(
      continued,
      new AbortController().signal
    )) {
      // consume
    }

    expect(body).toMatchObject({
      options: { num_ctx: 4_096, num_predict: 128 },
      keep_alive: "5m",
      messages: [
        { role: "user", content: "read" },
        { role: "assistant", tool_calls: [{ function: { name: "read_note", arguments: { path: "a.md" } } }] },
        { role: "tool", tool_name: "read_note", content: "result" },
      ],
    })
  })
})

describe("local provider URL", () => {
  it.each(["http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434"])(
    "allows loopback %s",
    (value) => expect(validateLocalProviderUrl(value).href).toContain("11434")
  )

  it.each([
    "https://example.com",
    "http://user:pass@127.0.0.1:11434",
    "ftp://127.0.0.1:11434",
  ])("rejects unsafe provider URL %s", (value) => {
    expect(() => validateLocalProviderUrl(value)).toThrow()
  })
})
