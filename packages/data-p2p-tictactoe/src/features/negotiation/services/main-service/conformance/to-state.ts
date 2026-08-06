// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read a store back into a `data/` negotiation `State` — the inverse of
// `fromState`. The non-serializable `gameDb` resource is deliberately excluded.
// Test-only.
export const toState = (store: CoreDatabase.Store): State => ({
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
});
