// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { resolveBulletHits } from "./resolve-bullet-hits.js";
import { create } from "./create.js";

// Inert, spec-owned cases (args is `{ dt }`). `resolveBulletHits` has no same-named
// ecs op — the collision system dispatches the `hitAsteroid` transaction per hit and
// is conformed by the detection/tick-loop tests — so `checkFeature` skips it; the
// pure `checkSpec` verifies it here. Detection is SWEPT: each bullet's path this
// frame is the segment [position - velocity*dt, position], and it destroys the first
// asteroid that segment passes through, scores it (large 20 / medium 50 / small 100),
// and replaces it with its split children (large→2 medium, medium→2 small,
// small→none). Stationary parents give children velocity [0,0]. Bullet.radius 2,
// asteroid radii 40/20/10. Every case keeps each bullet overlapping at most one
// asteroid, so the outcome is order-independent (collections compare as multisets).
const field = { ...create(), bounds: [800, 600] as [number, number] };

export const cases: Conformance.SpecCases<State, typeof resolveBulletHits> = {
  cases: [
    {
      name: "destroys bullet + asteroid, scores, and spawns split children (large → 2 medium)",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], size: "large" }],
        ]),
        score: 0,
      },
      args: { dt: 1 / 60 },
      after: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], size: "medium" }],
          [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
        ]),
        score: 20,
      },
    },
    {
      name: "medium splits into two small",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
        ]),
        score: 5,
      },
      args: { dt: 1 / 60 },
      after: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], size: "small" }],
          [2, { position: [50, 50], velocity: [0, 0], size: "small" }],
        ]),
        score: 55,
      },
    },
    {
      name: "the smallest tier is destroyed outright — no children",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], size: "small" }],
        ]),
        score: 0,
      },
      args: { dt: 1 / 60 },
      after: { ...field, entities: new Map(), score: 100 },
    },
    {
      name: "a bullet that hits nothing is left untouched",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [10, 10], velocity: [0, 0], age: 0 }],
          [2, { position: [500, 500], velocity: [0, 0], size: "large" }],
        ]),
        score: 7,
      },
      args: { dt: 1 / 60 },
      after: {
        ...field,
        entities: new Map([
          [1, { position: [10, 10], velocity: [0, 0], age: 0 }],
          [2, { position: [500, 500], velocity: [0, 0], size: "large" }],
        ]),
        score: 7,
      },
    },
    {
      name: "only the overlapping asteroid is hit; distant ones remain",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], size: "large" }],
          [3, { position: [500, 500], velocity: [0, 0], size: "small" }],
        ]),
        score: 0,
      },
      args: { dt: 1 / 60 },
      after: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], size: "medium" }],
          [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
          [3, { position: [500, 500], velocity: [0, 0], size: "small" }],
        ]),
        score: 20,
      },
    },
    {
      name: "two bullets each destroy their own asteroid",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [500, 500], velocity: [0, 0], age: 0 }],
          [3, { position: [50, 50], velocity: [0, 0], size: "small" }],
          [4, { position: [500, 500], velocity: [0, 0], size: "small" }],
        ]),
        score: 0,
      },
      args: { dt: 1 / 60 },
      after: { ...field, entities: new Map(), score: 200 },
    },
    {
      name: "split children are not hittable by another bullet in the same pass",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [3, { position: [50, 50], velocity: [0, 0], size: "large" }],
        ]),
        score: 0,
      },
      args: { dt: 1 / 60 },
      after: {
        ...field,
        // One bullet destroys the large (→ 2 medium). The second finds no original
        // target — the large is gone and its children, spawned this same pass, are
        // not yet hittable — so it survives.
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], size: "medium" }],
          [3, { position: [50, 50], velocity: [0, 0], size: "medium" }],
        ]),
        score: 20,
      },
    },
    {
      name: "boundary: distance exactly equal to the radius sum still overlaps",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [0, 0], velocity: [0, 0], age: 0 }],
          [2, { position: [42, 0], velocity: [0, 0], size: "large" }],
        ]),
        score: 0,
      },
      args: { dt: 1 / 60 },
      after: {
        ...field,
        entities: new Map([
          [1, { position: [42, 0], velocity: [0, 0], size: "medium" }],
          [2, { position: [42, 0], velocity: [0, 0], size: "medium" }],
        ]),
        score: 20,
      },
    },
    {
      name: "a fast bullet whose path sweeps through a medium destroys it (no tunnelling)",
      before: {
        ...field,
        // Over dt=1/60 the bullet travels 50px: prev = [0,0] - [-3000,0]/60 = [50,0].
        // Both endpoints are 25px from the medium at [25,0] — outside the 22px radius
        // sum, so a point test misses. The travelled segment crosses [25,0], so a
        // swept test hits.
        entities: new Map([
          [1, { position: [0, 0], velocity: [-3000, 0], age: 0 }],
          [2, { position: [25, 0], velocity: [0, 0], size: "medium" }],
        ]),
        score: 0,
      },
      args: { dt: 1 / 60 },
      after: {
        ...field,
        entities: new Map([
          [1, { position: [25, 0], velocity: [0, 0], size: "small" }],
          [2, { position: [25, 0], velocity: [0, 0], size: "small" }],
        ]),
        score: 50,
      },
    },
  ],
};
