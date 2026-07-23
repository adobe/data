// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `hitAsteroid` conforms to `State.resolveBulletHits`. The transform resolves
// EVERY bullet's hit in one pass; the transaction resolves ONE (bullet,
// asteroid) pair — the collision system dispatches it once per overlapping
// bullet. The `apply` closure reproduces that dispatch loop: it resolves each
// bullet's target from the seeded store (narrow-phase overlap, the same test
// `resolveBulletHits` uses) and dispatches the transaction. Every shared case
// keeps each bullet overlapping at most one asteroid, so the outcome is
// order-independent and the whole per-bullet pass equals the transform.
import { describe } from "vitest";
import type { Entity } from "@adobe/data/ecs";
import { State } from "../../../data/state/state.js";
import { Collision } from "../../../data/collision/collision.js";
import { Bullet } from "../../../data/bullet/bullet.js";
import { Asteroid } from "../../../data/asteroid/asteroid.js";
import { cases } from "../../../data/state/resolve-bullet-hits.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { hitAsteroid } from "./hit-asteroid.js";

describe("hitAsteroid transaction conforms to State.resolveBulletHits", () => {
  expectConforms({
    cases,
    spec: (before) => State.resolveBulletHits(before),
    apply: (store) => {
      // Bullets in insertion order — the order the transform processes them.
      for (const bullet of store.select(store.archetypes.Bullet.components)) {
        const bulletRow = store.read(bullet, store.archetypes.Bullet);
        if (bulletRow === null) continue;
        let target: Entity | undefined;
        for (const asteroid of store.select(store.archetypes.Asteroid.components)) {
          const asteroidRow = store.read(asteroid, store.archetypes.Asteroid);
          if (asteroidRow === null) continue;
          if (
            Collision.circlesOverlap(
              bulletRow.position,
              Bullet.radius,
              asteroidRow.position,
              Asteroid.radius(asteroidRow),
            )
          ) {
            target = asteroid;
            break;
          }
        }
        if (target !== undefined) hitAsteroid(store, { bullet, asteroid: target });
      }
    },
  });
});
