import type { BudgetLimits } from "../harness/budget"
import type { ModelRequest, RequestCounter, TokenEstimate } from "../providers/types"

export async function assertBudget(
  request: ModelRequest,
  limits: BudgetLimits,
  counter: RequestCounter
): Promise<TokenEstimate> {
  const estimate = await counter.count(request)
  if (!Number.isInteger(estimate.promptTokens) || estimate.promptTokens < 0) {
    throw new Error("The request counter returned an invalid prompt token count.")
  }
  if (estimate.promptTokens + limits.outputReserve + limits.safetyMargin > limits.requestView) {
    throw new Error("The final serialized request exceeds the verified token budget.")
  }
  return estimate
}
