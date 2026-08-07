// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { MainService } from "../main-service.js";
import * as registeredActions from "../action-database/actions/index.js";
import { increment } from "../action-database/actions/increment.js";
import { decrement } from "../action-database/actions/decrement.js";
import { reset } from "../action-database/actions/reset.js";
import { setUserName } from "../action-database/actions/set-user-name.js";
import { clearLog } from "../action-database/actions/clear-log.js";
import { cases as incrementCases } from "../../../data/state/increment.js";
import { cases as decrementCases } from "../../../data/state/decrement.js";
import { cases as resetCases } from "../../../data/state/reset.js";
import { cases as setUserNameCases } from "../../../data/state/set-user-name.js";
import { cases as clearLogCases } from "../../../data/state/clear-log.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Each transition's cases run against its same-named ecs action. `runActions`
// splits the case's injected services into recording overrides (via `makeDb`),
// runs the action, then asserts both the resulting state and the declared effects;
// the harness/coverage are shared. This feature injects no services, so every
// case's `effects` is empty and the split yields no overrides.
Conformance.runActions({
  // `toSystemDatabase` exposes the writable `.store` the projection needs.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, { services }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  registered: registeredActions,
  define: (conforms) => {
    conforms("increment", {
      cases: incrementCases,
      run: (db) => increment(db),
    });
    conforms("decrement", {
      cases: decrementCases,
      run: (db) => decrement(db),
    });
    conforms("reset", { cases: resetCases, run: (db) => reset(db) });
    conforms("setUserName", {
      cases: setUserNameCases,
      run: (db, input) => setUserName(db, { name: input.name ?? "" }),
    });
    conforms("clearLog", { cases: clearLogCases, run: (db) => clearLog(db) });
  },
});
