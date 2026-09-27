// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../../data/state/spec.js";
import * as transactions from "../transaction-database/transactions/index.js";
import { createStore } from "./create-store.js";
import { projection } from "./projection.js";
import { seedUserId } from "./seed-user-id.js";

// The escape hatch (see conformance.md): `movePresence` reads the peer identity from the
// transaction `userId` (the peer's mark) — ambient context not derivable from the case —
// so `seedContext` seeds it from the case's `mark` before the raw transaction runs. The
// cases come from the shared manifest via `adaptCases` (services off — a transaction
// never receives services).
Conformance.runTransactions({
  createStore,
  fromState: projection.fromState,
  toState: projection.toState,
  transitions: Conformance.adaptCases(spec.fns, spec.cases, spec.services, false),
  transactions,
  seedContext: (store, _before, args) =>
    // Runtime invariant: presence cases carry a `mark` (see move-presence.cases.ts).
    seedUserId(store, (args as { mark: string }).mark),
});
