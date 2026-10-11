import type { ContextPacket } from "../context/packet.ts";
import type { RunStage } from "./stage";
import type { EditorTarget } from "../context/insertion";

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
}
