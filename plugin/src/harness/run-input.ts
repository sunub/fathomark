import type { ContextPacket } from "../context/packet.ts";
import type { RunStage } from "./stage";

export interface RunInput {
  readonly question: string;
  readonly packet: ContextPacket;
  /** Defaults to exploration. */
  readonly stage?: RunStage;
}
