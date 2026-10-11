import type { BudgetLimits } from "../harness/budget"
import type { ModelRequest, RequestCounter, TokenEstimate } from "../providers/types"

export async function assertBudget(
  request: ModelRequest,
  limits: BudgetLimits,
  counter: RequestCounter
): Promise<TokenEstimate> {
  for (const value of Object.values(limits)) {
    if (!Number.isInteger(value) || value < 0) throw new Error("Invalid token budget limit.")
  }
  if (!Number.isInteger(request.contextWindow) || request.contextWindow <= 0 ||
      !Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0) {
    throw new Error("Invalid request context or output limit.")
  }
  if (request.maxOutputTokens > limits.outputReserve) {
    throw new Error("Request output exceeds the reserved output budget.")
  }
  const estimate = await counter.count(request)
  if (!Number.isInteger(estimate.promptTokens) || estimate.promptTokens < 0) {
    throw new Error("The request counter returned an invalid prompt token count.")
  }
  if (estimate.promptTokens + limits.outputReserve + limits.safetyMargin > Math.min(limits.requestView, limits.modelContext, request.contextWindow)) {
    throw new Error("The final serialized request exceeds the token budget.")
  }
  return estimate
}
