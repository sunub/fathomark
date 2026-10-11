import type { ContextPacket } from "../context/packet.ts";
import type { RunStage } from "./stage";
import type { EditorTarget } from "../context/insertion";
import type { EvidenceReference } from "../context/evidence";

export type RunMode = "chat" | "career";

export interface RunInput {
  readonly question: string;
  readonly packet: ContextPacket;
  /** Defaults to exploration. */
  readonly stage?: RunStage;
  /** Defaults to chat. Only career writing treats a reply without tool calls as unfinished. */
  readonly mode?: RunMode;
  readonly target?: EditorTarget | null;
  readonly pastedSource?: string;
  readonly keepFacts?: readonly string[];
  /** What a follow-up career request builds on from the previous run in the same view. */
  readonly previous?: PreviousCareerResult;
}

export interface PreviousCareerResult {
  /** In source-ID order. The draft's own [[S#]] markers are stripped, so renumbering is harmless. */
  readonly evidence: readonly EvidenceReference[];
  /** The verified draft, with its citations, while it has not been applied to the note. */
  readonly draft?: { readonly text: string; readonly target: EditorTarget | null };
}
