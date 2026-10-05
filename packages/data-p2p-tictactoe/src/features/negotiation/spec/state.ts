// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Phase } from "../data/values/phase/phase.js";
import type { ConnectionState } from "../data/values/connection-state/connection-state.js";
import type { Role } from "../data/values/role/role.js";
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { resources } from "../data/resources/index.js";

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

// Every key names a resource (negotiation has no components).
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, {}>>;

export * as State from "./public.js";
