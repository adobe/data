// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { Entity } from "@adobe/data/ecs";
import { Vec2 } from "@adobe/data/math";
import { Conformance } from "@adobe/data/testing";
import { Collision } from "../../../data/collision/collision.js";
import { Bullet } from "../../../data/bullet/bullet.js";
import { Asteroid } from "../../../data/asteroid/asteroid.js";
import { Ship } from "../../../data/ship/ship.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { setInput } from "../transaction-database/transactions/set-input.js";
import { setBounds } from "../transaction-database/transactions/set-bounds.js";
import { newGame } from "../transaction-database/transactions/new-game.js";
import { spawnRandomWave } from "../transaction-database/transactions/spawn-random-wave.js";
import { fireBullet } from "../transaction-database/transactions/fire-bullet.js";
import { hitAsteroid } from "../transaction-database/transactions/hit-asteroid.js";
import { loseLife } from "../transaction-database/transactions/lose-life.js";
import { cases as createInitialCases } from "../../../data/state/create-initial.js";
import { cases as spawnRandomWaveCases } from "../../../data/state/spawn-random-wave.js";
import { cases as fireBulletCases } from "../../../data/state/fire-bullet.js";
import { cases as resolveBulletHitsCases } from "../../../data/state/resolve-bullet-hits.js";
import { cases as resolveShipHitsCases } from "../../../data/state/resolve-ship-hits.js";

// The single conformance test for every ecs transaction. `runTransactions` owns the
// harness (fresh store, `fromState` seed, `toState` compare, coverage guard keyed
// off the registered barrel); the bespoke `apply` adapters stay here — several
// reproduce a collision system's per-pair dispatch against the seeded store. Entity
// bags compare as multisets via the `match` option. `setInput` / `setBounds` have no
// `data/` transform (they only record a resource), so they are asserted directly
// below and named in `covers` so the guard still counts them.
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  registered: registeredTransactions,
  covers: ["setInput", "setBounds"],
  match: { unordered: new Set(["bullets", "asteroids"]) },
  define: (conforms) => {
    // newGame ⇄ createInitial: seed the bounds the transform reads, then rebuild.
    conforms("newGame", {
      cases: createInitialCases,
      apply: (t, { bounds }) => {
        setBounds(t, bounds);
        newGame(t);
      },
    });

    // spawnRandomWave ⇄ State.spawnRandomWave: the same injected double drives both
    // sides (carried in each case's `args.random`), so the jittered velocities agree.
    conforms("spawnRandomWave", {
      cases: spawnRandomWaveCases,
      apply: spawnRandomWave,
    });

    // fireBullet ⇄ State.fireBullet: reads the seeded ship, inserts the muzzle bullet.
    conforms("fireBullet", {
      cases: fireBulletCases,
      apply: (t) => fireBullet(t),
    });

    // hitAsteroid ⇄ State.resolveBulletHits. The transform resolves EVERY bullet's hit
    // in one pass; the transaction resolves ONE (bullet, asteroid) pair — the collision
    // system dispatches it once per overlapping bullet. This `apply` reproduces that
    // dispatch loop: detect every pair FIRST against the untouched store (so no child a
    // split spawns this pass can be a target), each asteroid claimed by at most one
    // bullet, using the same SWEPT segment test, then apply.
    conforms("hitAsteroid", {
      cases: resolveBulletHitsCases,
      apply: (t, dt: number) => {
        const asteroids: readonly Entity[] = [
          ...t.select(t.archetypes.Asteroid.components),
        ];
        const claimed = new Set<Entity>();
        const hits: { readonly bullet: Entity; readonly asteroid: Entity }[] =
          [];
        for (const bullet of t.select(t.archetypes.Bullet.components)) {
          const bulletRow = t.read(bullet, t.archetypes.Bullet);
          if (bulletRow === null) continue;
          const prev = Vec2.subtract(
            bulletRow.position,
            Vec2.scale(bulletRow.velocity, dt),
          );
          for (const asteroid of asteroids) {
            if (claimed.has(asteroid)) continue;
            const asteroidRow = t.read(asteroid, t.archetypes.Asteroid);
            if (asteroidRow === null) continue;
            if (
              Collision.segmentCircleOverlap(
                prev,
                bulletRow.position,
                asteroidRow.position,
                Bullet.radius + Asteroid.radius(asteroidRow),
              )
            ) {
              claimed.add(asteroid);
              hits.push({ bullet, asteroid });
              break;
            }
          }
        }
        for (const hit of hits) hitAsteroid(t, hit);
      },
    });

    // loseLife ⇄ State.resolveShipHits. The transform decides whether the ship is
    // struck AND applies the consequence; the transaction is only the struck branch
    // (spend a life, respawn). This `apply` reproduces that decision from the seeded
    // store: dispatch `loseLife` iff the ship overlaps an asteroid.
    conforms("loseLife", {
      cases: resolveShipHitsCases,
      apply: (t) => {
        const [shipId] = t.select(t.archetypes.Ship.components);
        if (shipId === undefined) return;
        const shipRow = t.read(shipId, t.archetypes.Ship);
        if (shipRow === null) return;
        let struck = false;
        for (const asteroid of t.select(t.archetypes.Asteroid.components)) {
          const asteroidRow = t.read(asteroid, t.archetypes.Asteroid);
          if (asteroidRow === null) continue;
          if (
            Collision.circlesOverlap(
              shipRow.position,
              Ship.radius,
              asteroidRow.position,
              Asteroid.radius(asteroidRow),
            )
          ) {
            struck = true;
            break;
          }
        }
        if (struck) loseLife(t);
      },
    });
  },
});

// setInput / setBounds have no `data/` transform to conform to — they only record a
// resource — so they get a direct resource assertion (per transactions.md); they are
// named in `covers` above so the coverage guard still counts them.
describe("setInput transaction", () => {
  it("writes the dispatched input to the resource verbatim", () => {
    const store = createStore();
    const input = { turn: 1, thrust: true, fire: false };
    setInput(store, input);
    expect(store.resources.input).toEqual(input);
  });
});

describe("setBounds transaction", () => {
  it("writes the dispatched bounds to the resource verbatim", () => {
    const store = createStore();
    setBounds(store, [1024, 768]);
    expect(store.resources.bounds).toEqual([1024, 768]);
  });
});
