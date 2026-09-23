/*
 * The Tool Registry.
 *
 * docs/ARCHITECTURE.md lists what every tool must declare, and the list is not
 * decoration — each field is something the harness needs in order to refuse,
 * bound, or attribute a call. A tool that cannot answer all seven questions is
 * not ready to be registered.
 */

import type { ZodType } from "zod"

import type { EvidenceReference } from "../context/evidence"
import type { Capability } from "../harness/policy"

export interface ToolDefinition<Input = unknown, Output = unknown> {
  readonly name: string
  /** Written for the model. It decides from this whether the tool applies. */
  readonly description: string
  readonly input: ZodType<Input>
  readonly output: ZodType<Output>
  /** Drives the permission decision. One capability per tool. */
  readonly capability: Capability
  readonly approval: "never" | "each_call"
  readonly timeoutMs: number
  /** Hard cap on what a result may contribute to the request view. */
  readonly resultBudgetTokens: number
  /** Turns a result into the references the sources panel and answer cite. */
  readonly provenance: (output: Output) => readonly EvidenceReference[]
  readonly run: (input: Input, signal: AbortSignal) => Promise<Output>
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<never, never>>()

  register<Input, Output>(tool: ToolDefinition<Input, Output>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`A tool named ${tool.name} is already registered.`)
    }
    this.tools.set(tool.name, tool as unknown as ToolDefinition<never, never>)
  }

  get(name: string): ToolDefinition<never, never> | undefined {
    return this.tools.get(name)
  }

  /** The allowlist the harness checks a model-proposed name against. */
  names(): string[] {
    return [...this.tools.keys()]
  }
}

/*
 * MVP tools, per docs/PRODUCT.md: search_vault, read_note, and bounded
 * Wikipedia search and page reading. They are implemented in Phase 1, together
 * with the retrieval they depend on. Registering a half-built tool would let
 * the model call it, so they are absent rather than stubbed.
 */
