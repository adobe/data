// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` negotiation `State` — the scalar
// resources. The non-serializable `gameDb` resource is left at its default; it
// is invisible to the spec. The inverse of `toState`. Test-only.
export const fromState = (store: CoreDatabase.Store, state: State): void => {
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
};
