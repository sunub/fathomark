import { describe, expect, it } from "vitest"

import { observeError, observeResult } from "../src/harness/observation"
import { ToolExecutionError } from "../src/harness/tool-executor"

const reference = { kind: "vault", path: "a.md", excerpt: "x" } as const

describe("observeResult", () => {
  it("is empty when an evidence tool cites nothing", () => {
    expect(observeResult("search_vault", { content: "{}", references: [] }).kind).toBe("empty")
  })

  it("is content when an evidence tool cites something", () => {
    expect(observeResult("search_vault", { content: "{}", references: [reference] }).kind).toBe("content")
  })

  it("is content when a non-evidence tool cites nothing", () => {
    expect(observeResult("ask_user", { content: "{}", references: [] }).kind).toBe("content")
  })

  it("passes the content through unchanged", () => {
    expect(observeResult("read_note", { content: '{"a":1}', references: [] }).content).toBe('{"a":1}')
  })
})

describe("observeError", () => {
  it("keeps the code of a tool execution error", () => {
    const observed = observeError(new ToolExecutionError("invalid_input", "bad"))
    expect(observed).toMatchObject({ kind: "error", code: "invalid_input", message: "bad" })
  })

  it("gives other failures the generic code", () => {
    expect(observeError(new Error("boom")).code).toBe("tool_error")
    expect(observeError("text").message).toBe("text")
  })

  it("tells the model the message as { error }", () => {
    expect(JSON.parse(observeError(new Error("boom")).content)).toEqual({ error: "boom" })
  })
})
