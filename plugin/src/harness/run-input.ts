import type { ContextPacket } from "../context/packet.ts";

export interface RunInput {
  readonly question: string;
  readonly packet: ContextPacket;
}
