// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Phase } from "../phase/phase.js";
import type { ConnectionState } from "../connection-state/connection-state.js";
import type { Role } from "../role/role.js";

/**
 * The serializable negotiation (signaling) state as one immutable object — the
 * spec the ECS main-service is verified against. The non-serializable game
 * database handle is deliberately *not* modelled here: it is session-only ECS
 * state, invisible to this pure spec.
 */
export type State = {
  readonly phase: Phase;
  readonly connection: ConnectionState;
  readonly role: Role | null;
  readonly sessionId: string | null;
  readonly offerCode: string;
  readonly answerCode: string;
  readonly bannerText: string;
  readonly bannerError: boolean;
  readonly hostAnswerInput: string;
  readonly joinerOfferInput: string;
};
export * as State from "./public.js";
