import { expect, it } from "vitest"
import { createLocalCounter, estimateTokens, TOKENS_PER_BYTE } from "../src/context/local-counter"
import { assertBudget } from "../src/context/token-budget"
import { PROPOSED_LIMITS } from "../src/harness/budget"
import type { ModelRequest } from "../src/providers/types"

it("estimates Korean input below its UTF-8 size and rejects requests over the request view", async () => {
  const request: ModelRequest = { model: "m", messages: [{ role: "user", content: "한글😀" }], tools: [], maxOutputTokens: 1400, contextWindow: 16000 }
  const counter = createLocalCounter()
  const estimate = await counter.count(request)
  expect(estimate.method).toBe("estimate")
  expect(estimate.promptTokens).toBeGreaterThan(0)
  const korean = (chars: number): ModelRequest => ({ ...request, messages: [{ role: "user", content: "한".repeat(chars) }] })
  // 10,500 bytes of Korean is about 3,200 real tokens, which the old byte count rejected.
  await expect(assertBudget(korean(3500), PROPOSED_LIMITS, counter)).resolves.toMatchObject({ method: "estimate" })
  await expect(assertBudget(korean(6000), PROPOSED_LIMITS, counter)).rejects.toThrow(/budget/)
})

it("never lets an accepted request exceed the model context, even if every byte were a token", () => {
  // A token covers at least one UTF-8 byte, so bytes bound the real prompt. Digit runs reach that bound.
  expect(PROPOSED_LIMITS.requestView / TOKENS_PER_BYTE).toBeLessThanOrEqual(PROPOSED_LIMITS.modelContext)
  expect(estimateTokens("1234")).toBe(Math.ceil(4 * TOKENS_PER_BYTE))
})

it("rejects invalid request limits rather than comparing against NaN", async () => {
  const request: ModelRequest = { model: "m", messages: [], tools: [], maxOutputTokens: 1400, contextWindow: 16000 }
  await expect(assertBudget(request, { ...PROPOSED_LIMITS, requestView: NaN }, createLocalCounter())).rejects.toThrow(/limit/)
  await expect(assertBudget({ ...request, maxOutputTokens: 2000 }, PROPOSED_LIMITS, createLocalCounter())).rejects.toThrow(/reserve/)
})

it("does not count a response schema, which constrains output and never enters the prompt", async () => {
  const request: ModelRequest = { model: "m", messages: [{ role: "user", content: "한글" }], tools: [], maxOutputTokens: 1400, contextWindow: 16000 }
  const counter = createLocalCounter()
  const schema = { type: "object", properties: { text: { type: "string", description: "x".repeat(2000) } } }
  expect((await counter.count({ ...request, responseSchema: schema })).promptTokens).toBe((await counter.count(request)).promptTokens)
})
