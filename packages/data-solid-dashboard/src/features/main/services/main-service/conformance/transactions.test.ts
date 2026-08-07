// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { increment } from "../transaction-database/transactions/increment.js";
import { decrement } from "../transaction-database/transactions/decrement.js";
import { reset } from "../transaction-database/transactions/reset.js";
import { setUserName } from "../transaction-database/transactions/set-user-name.js";
import { clearLog } from "../transaction-database/transactions/clear-log.js";
import { cases as incrementCases } from "../../../data/state/increment.js";
import { cases as decrementCases } from "../../../data/state/decrement.js";
import { cases as resetCases } from "../../../data/state/reset.js";
import { cases as setUserNameCases } from "../../../data/state/set-user-name.js";
import { cases as clearLogCases } from "../../../data/state/clear-log.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The single conformance test for every ecs transaction. `runTransactions` owns
// the harness (fresh store, `fromState` seed, `toState` compare, coverage guard
// keyed off the registered barrel); each transaction's `apply` calls the raw
// transaction directly. This feature holds only scalar resources, so nothing is
// id-addressed and the shared `resolve` is unused.
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  registered: registeredTransactions,
  define: (conforms) => {
    conforms("increment", { cases: incrementCases, apply: increment });
    conforms("decrement", { cases: decrementCases, apply: decrement });
    conforms("reset", { cases: resetCases, apply: reset });
    conforms("setUserName", { cases: setUserNameCases, apply: setUserName });
    conforms("clearLog", { cases: clearLogCases, apply: clearLog });
  },
});
