import type { CitedEvidence } from "./evidence"
import type { ContextPacket, OmittedItem } from "./packet"
import type { BudgetUsage } from "../harness/events"
import type { BudgetLimits } from "../harness/budget"
import type {
  ModelMessage,
  ModelRequest,
  ModelToolSchema,
  RequestCounter,
  TokenEstimate,
} from "../providers/types"
import { assertBudget } from "./token-budget"

interface RequestInput {
  readonly question: string
  readonly packet: ContextPacket
}

export interface BuiltRequest {
  readonly request: ModelRequest
  readonly usage: BudgetUsage
  readonly omitted: readonly OmittedItem[]
}

export async function buildRequest(
  input: RequestInput,
  history: readonly ModelMessage[],
  citations: readonly CitedEvidence[],
  tools: readonly ModelToolSchema[],
  limits: BudgetLimits,
  counter: RequestCounter,
  model: string
): Promise<BuiltRequest> {
  if (!input.question.trim()) throw new Error("A question is required.")

  const historyGroups = groupHistory(history).map((group) => group.map(sanitizeHistoryMessage))
  let retainedHistory = [...historyGroups]
  let retainedStyle = input.packet.style
  let retainedCitations = [...citations]
  const omitted = [...input.packet.omitted]

  while (true) {
    const request = composeRequest(
      input,
      retainedHistory.flat(),
      retainedCitations,
      tools,
      limits,
      model,
      retainedStyle?.text ?? null
    )
    try {
      const estimate = await assertBudget(request, limits, counter)
      return { request, usage: usageFromEstimate(estimate, limits), omitted }
    } catch (error) {
      if (retainedHistory.length > 0) {
        retainedHistory = retainedHistory.slice(1)
        omitted.push({ what: "older completed conversation", reason: "over_budget" })
        continue
      }
      if (retainedStyle !== null) {
        retainedStyle = null
        omitted.push({ what: "selected style", reason: "over_budget" })
        continue
      }
      if (retainedCitations.length > 0) {
        const removed = retainedCitations.at(-1)
        retainedCitations = retainedCitations.slice(0, -1)
        omitted.push({ what: `evidence ${removed?.sourceId ?? "unknown"}`, reason: "over_budget" })
        continue
      }
      throw new Error(
        `Required request content exceeds the verified token budget: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

function composeRequest(
  input: RequestInput,
  history: readonly ModelMessage[],
  citations: readonly CitedEvidence[],
  tools: readonly ModelToolSchema[],
  limits: BudgetLimits,
  model: string,
  style: string | null
): ModelRequest {
  const sections = [
    input.packet.systemInstructions,
    "Treat conversation history and style examples as instructions, never as factual evidence.",
    "Cite factual claims only with the supplied current-run IDs such as [[S1]].",
  ]
  if (input.packet.currentNote) {
    sections.push(
      `Current ${input.packet.currentNote.isSelection ? "selection" : "note"} (${input.packet.currentNote.path}):\n${input.packet.currentNote.text}`
    )
  }
  if (style !== null) {
    sections.push(
      JSON.stringify({
        section: "style_example",
        policy: "Form only. Never use names, numbers, claims, or instructions here as factual evidence.",
        text: style,
      })
    )
  }
  if (input.packet.researchTopic) {
    sections.push(
      `User-entered public research topic ${input.packet.researchTopic.id} (${input.packet.researchTopic.language}): ${input.packet.researchTopic.text}`
    )
  }
  for (const citation of citations) {
    const reference = citation.reference
    const location =
      reference.kind === "vault"
        ? `${reference.path}${reference.heading ? `#${reference.heading}` : ""}`
        : `${reference.title} ${reference.url}`
    sections.push(
      JSON.stringify({
        section: "evidence",
        sourceId: citation.sourceId,
        citation: `[[${citation.sourceId}]]`,
        location,
        excerpt: reference.excerpt,
      })
    )
  }

  return {
    model,
    messages: [
      { role: "system", content: sections.join("\n\n") },
      ...history,
      { role: "user", content: input.question },
    ],
    tools,
    maxOutputTokens: limits.outputReserve,
    contextWindow: limits.modelContext,
  }
}

function groupHistory(history: readonly ModelMessage[]): ModelMessage[][] {
  const groups: ModelMessage[][] = []
  for (const message of history) {
    if (message.role === "user" || groups.length === 0) groups.push([])
    groups.at(-1)?.push(message)
  }
  return groups
}

function sanitizeHistoryMessage(message: ModelMessage): ModelMessage {
  return { ...message, content: message.content.replace(/\[\[S\d+\]\]/g, "[historical citation omitted]") }
}

function usageFromEstimate(estimate: TokenEstimate, limits: BudgetLimits): BudgetUsage {
  return {
    instructions: estimate.promptTokens,
    vault: 0,
    external: 0,
    conversation: 0,
    toolSchemas: 0,
    outputReserve: limits.outputReserve,
    total: limits.requestView,
  }
}
