// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import type { OpponentService } from "../../opponent-service/opponent-service.js";
import { MainService } from "../main-service.js";
import * as registeredActions from "../action-database/actions/index.js";
import { playMove } from "../action-database/actions/play-move.js";
import { playOpponentMove } from "../action-database/actions/play-opponent-move.js";
import { restartGame } from "../action-database/actions/restart-game.js";
import { cases as playMoveCases } from "../../../data/state/play-move.js";
import { cases as playOpponentMoveCases } from "../../../data/state/play-opponent-move.js";
import { cases as restartGameCases } from "../../../data/state/restart-game.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Each transition's cases run against its same-named ecs action, asserting state
// and declared effects. `runActions` splits the case's injected services into
// recording overrides via `makeDb`; the harness/coverage are shared.
Conformance.runActions({
  // `toSystemDatabase` exposes the writable `.store` the projection needs. Runtime
  // invariant: the recording wrappers preserve the service's shape, so they are a
  // valid factory override.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, {
        services: services as { opponent?: OpponentService },
      }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  registered: registeredActions,
  define: (conforms) => {
    conforms("playMove", {
      cases: playMoveCases,
      run: (db, input) => playMove(db, { index: input.index ?? -1 }),
    });
    conforms("playOpponentMove", {
      cases: playOpponentMoveCases,
      run: (db) => playOpponentMove(db),
    });
    conforms("restartGame", {
      cases: restartGameCases,
      run: (db) => restartGame(db),
    });
  },
});
