// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { transitions } from "../../../data/state/transitions.js";
import * as transactions from "../transaction-database/transactions/index.js";
import { createStore } from "./create-store.js";
import { seedUserId } from "./seed-user-id.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// `movePresence` reads the peer identity from the transaction `userId` (the peer's
// mark) — ambient context not derivable from the case, so `seedContext` seeds it
// from the case's `mark` before the raw transaction runs (the one residual hook).
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  transitions,
  transactions,
  seedContext: (store, _before, args) =>
    seedUserId(store, (args as { mark: string }).mark),
});
