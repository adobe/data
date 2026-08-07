// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { playMove } from "../transaction-database/transactions/play-move.js";
import { restartGame } from "../transaction-database/transactions/restart-game.js";
import { cases as playMoveCases } from "../../../data/state/play-move.js";
import { cases as restartGameCases } from "../../../data/state/restart-game.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The single conformance test for every ecs transaction. `runTransactions` owns
// the harness (fresh store, `fromState` seed, `toState` compare, coverage guard
// keyed off the registered barrel). Tic-tac-toe moves are addressed by board
// index, not entity id, so the `apply` adapters need no `resolve`.
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  registered: registeredTransactions,
  define: (conforms) => {
    conforms("playMove", { cases: playMoveCases, apply: playMove });
    conforms("restartGame", {
      cases: restartGameCases,
      apply: (t) => restartGame(t),
    });
  },
});
