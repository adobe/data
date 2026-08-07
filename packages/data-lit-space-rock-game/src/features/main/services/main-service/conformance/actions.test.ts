// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import type { RandomService } from "../../random-service/random-service.js";
import { MainService } from "../main-service.js";
import * as registeredActions from "../action-database/actions/index.js";
import { fireBullet } from "../action-database/actions/fire-bullet.js";
import { spawnRandomWave } from "../action-database/actions/spawn-random-wave.js";
import { cases as fireBulletCases } from "../../../data/state/fire-bullet.js";
import { cases as spawnRandomWaveCases } from "../../../data/state/spawn-random-wave.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Only the app-facing, single-transaction transitions get an action: `fireBullet`
// (no service) and `spawnRandomWave` (injects the `random` service — a
// value-returning read, so nothing is declared in `effects`). The per-frame step
// transitions are realized by the systems layer and conformed by the tick-loop
// test, not here. Entity bags compare as multisets via the `match` option.
Conformance.runActions({
  // Runtime invariant: the recording wrappers preserve the service's shape, so
  // they are a valid factory override.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, {
        services: services as { random?: RandomService },
      }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  registered: registeredActions,
  match: { unordered: new Set(["bullets", "asteroids"]) },
  define: (conforms) => {
    conforms("fireBullet", {
      cases: fireBulletCases,
      run: (db) => fireBullet(db),
    });
    conforms("spawnRandomWave", {
      cases: spawnRandomWaveCases,
      run: (db) => spawnRandomWave(db),
    });
  },
});
