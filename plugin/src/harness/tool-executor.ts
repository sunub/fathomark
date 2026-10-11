import type { EvidenceReference } from "../context/evidence"
import type { ModelToolCall } from "../providers/types"
import type { ToolExecutionContext } from "../tools/registry"
import type { ToolRegistry } from "../tools/registry"
import { decide, type PermissionContext } from "./policy"
import { raceWithSignal } from "./abort"
import { isToolInStage, type RunStage } from "./stage"

export type ToolExecutionErrorCode =
  | "unknown_tool"
  | "permission_denied"
  | "approval_required"
  | "invalid_input"
  | "invalid_output"
  | "timeout"
  | "result_budget"

export class ToolExecutionError extends Error {
  constructor(readonly code: ToolExecutionErrorCode, message: string) {
    super(message)
    this.name = "ToolExecutionError"
  }
}

export async function executeTool(
  call: ModelToolCall,
  registry: ToolRegistry,
  permissions: () => PermissionContext,
  context: ToolExecutionContext,
  stage: RunStage = "explore"
): Promise<{ content: string; references: readonly EvidenceReference[] }> {
  const tool = registry.get(call.name)
  if (!tool) throw new ToolExecutionError("unknown_tool", `${call.name} is not a Fathomark tool.`)

  // A tool the stage withholds is refused like a denied capability, so the run goes on.
  if (!isToolInStage(tool.name, stage)) {
    throw new ToolExecutionError("permission_denied", `${tool.name} is not available in this stage.`)
  }

  const decision = decide(tool.capability, permissions())
  if (!decision.allowed) throw new ToolExecutionError("permission_denied", decision.reason)
  if (decision.requiresApproval || tool.approval === "each_call") {
    throw new ToolExecutionError("approval_required", "This tool requires explicit approval.")
  }

  const input = tool.input.safeParse(call.args)
  if (!input.success) {
    throw new ToolExecutionError("invalid_input", `Invalid ${tool.name} input: ${input.error.message}`)
  }

  const timeoutController = new AbortController()
  const timeout = setTimeout(() => {
    timeoutController.abort(new DOMException(`${tool.name} timed out.`, "TimeoutError"))
  }, tool.timeoutMs)
  const signal = AbortSignal.any([context.signal, timeoutController.signal])
  try {
    signal.throwIfAborted()
    const output = await raceWithSignal(tool.run(input.data, { ...context, signal }), signal)
    signal.throwIfAborted()
    const parsed = tool.output.safeParse(output)
    if (!parsed.success) {
      throw new ToolExecutionError("invalid_output", `Invalid ${tool.name} output: ${parsed.error.message}`)
    }
    const content = JSON.stringify(parsed.data)
    if (context.countResultTokens && context.countResultTokens(content) > tool.resultBudgetTokens) {
      throw new ToolExecutionError("result_budget", `${tool.name} result exceeds its ${tool.resultBudgetTokens} token estimate budget.`)
    }
    return {
      content,
      references: tool.provenance(parsed.data),
    }
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new ToolExecutionError("timeout", `${tool.name} timed out after ${tool.timeoutMs}ms.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
