import { registerEvidence } from "../context/evidence"
import { buildRequest } from "../context/request"
import type { ModelMessage, ModelProvider, ModelToolCall, RequestCounter } from "../providers/types"
import type { ToolExecutionContext, ToolRegistry } from "../tools/registry"
import type { BudgetLimits } from "./budget"
import type { RunEvent, RunId } from "./events"
import type { RunInput } from "./harness"
import type { PermissionContext } from "./policy"
import { executeTool, ToolExecutionError } from "./tool-executor"

const MAX_MODEL_ROUNDS = 8
const MAX_CALLS_TOTAL = 12
const MAX_CALLS_PER_TOOL = 5

interface LoopOptions {
  readonly provider: ModelProvider
  readonly model: string
  readonly tools: ToolRegistry
  readonly limits: BudgetLimits
  readonly counter: RequestCounter
  readonly permissions: () => PermissionContext
}

export async function* runAgentLoop(
  runId: RunId,
  input: RunInput,
  options: LoopOptions,
  signal: AbortSignal
): AsyncIterable<RunEvent> {
  const toolSchemas = options.tools.definitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
  const history: ModelMessage[] = input.packet.conversation.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }))
  let citations = registerEvidence([], input.packet.evidence)
  const announced = new Set<string>()
  const completedCalls = new Map<string, string>()
  const counts = new Map<string, number>()
  let totalCalls = 0
  let repairRounds = 0
  const allowedWikipediaPages = new Set<string>()

  for (let round = 0; round < MAX_MODEL_ROUNDS; round += 1) {
    signal.throwIfAborted()
    const { request, usage } = await buildRequest(
      input,
      history,
      citations,
      toolSchemas,
      options.limits,
      options.counter,
      options.model
    )
    yield { type: "budget", runId, usage }

    const calls: ModelToolCall[] = []
    let assistantText = ""
    let sawDone = false
    for await (const event of options.provider.stream(request, signal)) {
      signal.throwIfAborted()
      if (event.type === "text") {
        assistantText += event.delta
        yield { type: "text", runId, delta: event.delta }
      } else if (event.type === "tool_call") {
        calls.push(event.call)
        if (!announced.has(event.call.callId)) {
          announced.add(event.call.callId)
          yield {
            type: "tool_call",
            runId,
            callId: event.call.callId,
            tool: event.call.name,
            args: event.call.args,
          }
        }
      } else {
        sawDone = true
      }
    }
    if (!sawDone) throw new Error("The model stream ended without a completion event.")
    if (calls.length === 0) return

    history.push({ role: "assistant", content: assistantText, toolCalls: calls })
    let mayContinue = true
    for (const call of calls) {
      totalCalls += 1
      const toolCount = (counts.get(call.name) ?? 0) + 1
      counts.set(call.name, toolCount)
      if (toolCount > MAX_CALLS_PER_TOOL || totalCalls > MAX_CALLS_TOTAL) {
        const reason =
          toolCount > MAX_CALLS_PER_TOOL
            ? `${call.name} exceeded the limit of ${MAX_CALLS_PER_TOOL} calls.`
            : `This run exceeded the limit of ${MAX_CALLS_TOTAL} tool calls.`
        yield { type: "tool_failed", runId, callId: call.callId, reason }
        return
      }

      const previous = completedCalls.get(call.callId)
      if (previous !== undefined) {
        history.push({ role: "tool", callId: call.callId, content: previous })
        continue
      }

      const context: ToolExecutionContext = {
        signal,
        researchTopic: input.packet.researchTopic,
        allowedWikipediaPages,
        permissions: options.permissions,
        onResearchQuery: (query, language) => researchQueries.push({ query, language }),
      }
      const researchQueries: Array<{ query: string; language: "ko" | "en" }> = []
      try {
        const result = await executeTool(call, options.tools, options.permissions, context)
        for (const query of researchQueries) {
          yield { type: "research_query", runId, query: query.query, language: query.language }
        }
        completedCalls.set(call.callId, result.content)
        history.push({ role: "tool", callId: call.callId, content: result.content })
        yield {
          type: "tool_result",
          runId,
          callId: call.callId,
          summary: result.content,
          truncated: false,
        }
        const updated = registerEvidence(citations, result.references)
        for (const cited of updated.slice(citations.length)) {
          yield {
            type: "evidence",
            runId,
            sourceId: cited.sourceId,
            reference: cited.reference,
          }
        }
        citations = updated
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        history.push({ role: "tool", callId: call.callId, content: JSON.stringify({ error: reason }) })
        yield { type: "tool_failed", runId, callId: call.callId, reason }
        if (error instanceof ToolExecutionError && error.code === "invalid_input") {
          repairRounds += 1
          if (repairRounds > 1) mayContinue = false
        } else if (error instanceof ToolExecutionError && error.code === "permission_denied") {
          mayContinue = true
        } else {
          mayContinue = false
        }
      }
      if (!mayContinue) return
    }
  }

  yield {
    type: "error",
    runId,
    message: `The model reached the limit of ${MAX_MODEL_ROUNDS} rounds.`,
    recoverable: true,
  }
}
