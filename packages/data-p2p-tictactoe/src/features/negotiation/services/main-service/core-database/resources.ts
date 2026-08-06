// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Phase } from "../../../data/phase/phase.js";
import type { ConnectionState } from "../../../data/connection-state/connection-state.js";
import type { Role } from "../../../data/role/role.js";

/**
 * Negotiation state surface: resources only. Every resource is `nonPersistent`
 * (session scope) so the negotiation database is never replicated — it is always
 * local-only. Authored as plain `{ default, nonPersistent }` entries rather than
 * `Database.resources({ session: … })`: `gameDb` holds a non-serializable live
 * database handle that no `Schema` can express, and the whole set is session-only
 * runtime state.
 */
export const resources = {
  phase: { default: "idle" as Phase, nonPersistent: true },
  connection: { default: "idle" as ConnectionState, nonPersistent: true },
  role: { default: null as Role | null, nonPersistent: true },
  sessionId: { default: null as string | null, nonPersistent: true },
  offerCode: { default: "" as string, nonPersistent: true },
  answerCode: { default: "" as string, nonPersistent: true },
  bannerText: { default: "" as string, nonPersistent: true },
  bannerError: { default: false as boolean, nonPersistent: true },
  hostAnswerInput: { default: "" as string, nonPersistent: true },
  joinerOfferInput: { default: "" as string, nonPersistent: true },
  // The synced game database, populated by the connection service after the
  // WebRTC channel opens. `unknown` so the negotiation plugin stays
  // game-agnostic; the UI narrows it at the render boundary.
  gameDb: { default: null as unknown, nonPersistent: true },
};
