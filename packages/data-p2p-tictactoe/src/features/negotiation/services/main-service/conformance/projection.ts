// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// The test-only store↔`State` projection, passed to `Conformance.runFeature`.
// Negotiation is resource-only (no entity collections), so `fromState` seeds the
// scalar resources and returns nothing — ids resolve to `Entity.none` — and there
// is no per-entity `toData`. The non-serializable `gameDb` resource is deliberately
// left at its default: it is session-only ECS state, invisible to the spec.
export const projection = {
  fromState: (store: CoreDatabase.Store, state: State): void => {
    store.resources.phase = state.phase;
    store.resources.connection = state.connection;
    store.resources.role = state.role;
    store.resources.sessionId = state.sessionId;
    store.resources.offerCode = state.offerCode;
    store.resources.answerCode = state.answerCode;
    store.resources.bannerText = state.bannerText;
    store.resources.bannerError = state.bannerError;
    store.resources.hostAnswerInput = state.hostAnswerInput;
    store.resources.joinerOfferInput = state.joinerOfferInput;
  },
  toState: (store: CoreDatabase.Store): State => ({
    phase: store.resources.phase,
    connection: store.resources.connection,
    role: store.resources.role,
    sessionId: store.resources.sessionId,
    offerCode: store.resources.offerCode,
    answerCode: store.resources.answerCode,
    bannerText: store.resources.bannerText,
    bannerError: store.resources.bannerError,
    hostAnswerInput: store.resources.hostAnswerInput,
    joinerOfferInput: store.resources.joinerOfferInput,
  }),
};
