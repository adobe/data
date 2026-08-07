// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { movePresence } from "../transaction-database/transactions/move-presence.js";
import { cases as movePresenceCases } from "../../../data/state/move-presence.js";
import { createStore } from "./create-store.js";
import { seedUserId } from "./seed-user-id.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The single conformance test for every ecs transaction. `runTransactions` owns
// the harness (fresh store, `fromState` seed, `toState` compare, coverage guard
// keyed off the registered barrel). `movePresence` reads the peer identity from
// the transaction `userId` (the peer's assigned mark), so the bespoke `apply`
// seeds that identity from the case's `mark` before dispatching the raw
// transaction with the plain `{ x, y }` payload.
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  registered: registeredTransactions,
  define: (conforms) => {
    conforms("movePresence", {
      cases: movePresenceCases,
      apply: (store, { mark, x, y }) => {
        seedUserId(store, mark);
        movePresence(store, { x, y });
      },
    });
  },
});
