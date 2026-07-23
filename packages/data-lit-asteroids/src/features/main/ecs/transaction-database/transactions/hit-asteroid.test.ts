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
import { Vec2 } from "@adobe/data/math";
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
    spec: State.resolveBulletHits,
    apply: (store, dt) => {
      // Detect every (bullet, asteroid) pair FIRST, against the untouched store —
      // so no child a split spawns this pass can be a target (and no reused entity
      // id can alias one). Each asteroid is claimed by at most one bullet, matching
      // resolveBulletHits (which splices the hit asteroid out). Detection is swept:
      // reconstruct each bullet's path this frame (prev = position - velocity*dt)
      // and test that segment, so a fast bullet cannot tunnel through. Then apply.
      const asteroids: readonly Entity[] = [...store.select(store.archetypes.Asteroid.components)];
      const claimed = new Set<Entity>();
      const hits: { readonly bullet: Entity; readonly asteroid: Entity }[] = [];
      for (const bullet of store.select(store.archetypes.Bullet.components)) {
        const bulletRow = store.read(bullet, store.archetypes.Bullet);
        if (bulletRow === null) continue;
        const prev = Vec2.subtract(bulletRow.position, Vec2.scale(bulletRow.velocity, dt));
        for (const asteroid of asteroids) {
          if (claimed.has(asteroid)) continue;
          const asteroidRow = store.read(asteroid, store.archetypes.Asteroid);
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
      for (const hit of hits) hitAsteroid(store, hit);
    },
  });
});
