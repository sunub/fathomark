import { expect, it } from "vitest"
import { createLocalCounter } from "../src/context/local-counter"
import { assertBudget } from "../src/context/token-budget"
import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { ModelRequest } from "../src/providers/types"

it("counts serialized Korean input and schemas honestly as an estimate", async () => {
  const request: ModelRequest = { model: "m", messages: [{ role: "user", content: "한글😀" }], tools: [], maxOutputTokens: 1400, contextWindow: 16000 }
  const counter = createLocalCounter()
  const estimate = await counter.count(request)
  expect(estimate.method).toBe("estimate")
  expect(estimate.promptTokens).toBeGreaterThanOrEqual(new TextEncoder().encode(JSON.stringify(request)).length)
  await expect(assertBudget({ ...request, messages: [{ role: "user", content: "한".repeat(4000) }] }, PROPOSED_LIMITS, counter)).rejects.toThrow(/budget/)
})

it("rejects invalid request limits rather than comparing against NaN", async () => {
  const request: ModelRequest = { model: "m", messages: [], tools: [], maxOutputTokens: 1400, contextWindow: 16000 }
  await expect(assertBudget(request, { ...PROPOSED_LIMITS, requestView: NaN }, createLocalCounter())).rejects.toThrow(/limit/)
  await expect(assertBudget({ ...request, maxOutputTokens: 2000 }, PROPOSED_LIMITS, createLocalCounter())).rejects.toThrow(/reserve/)
})
