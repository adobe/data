// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import * as transactions from "../transaction-database/transactions/index.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs transaction, conformed by name against its `data/state` transition —
// no per-item wiring. `runTransactions` discovers the transitions (the glob),
// pairs each registered transaction to the same-named one, seeds `fromState`,
// applies, and compares `toState`. Auto-pairs `createInitial`, `spawnRandomWave`,
// and `fireBullet`; `newGame`/`setInput`/`setBounds` (infra — no `data/`
// transform) and `hitAsteroid`/`loseLife` (system-dispatched — the collision
// system's behavior is covered by `system-database/collision-detection.test.ts`
// and the `resolveBulletHits`/`resolveShipHits` transitions by
// `data/state/spec.test.ts`) have no same-named transition and are skipped.
// Entity bags compare as multisets via the `match` option.
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  transitions: import.meta.glob(
    [
      "../../../data/state/*.ts",
      "!../../../data/state/*.test.ts",
      "!../../../data/state/*.type-test.ts",
    ],
    { eager: true },
  ),
  transactions,
  match: { unordered: new Set(["bullets", "asteroids"]) },
});
