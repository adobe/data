// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { collision } from "./collision.js";
import { Ship } from "../data/values/ship/ship.js";

// Cases for the `collision` system. Bullet detection is SWEPT: a bullet's path this
// frame is [position − velocity·dt, position], and it destroys the first asteroid
// that segment passes through, scores it (large 20 / medium 50 / small 100), and
// replaces it with its split children (stationary parents → stationary children).
// Then an asteroid touching the ship costs one life (floored at 0) and respawns it at
// the centre. Radii: bullet 2, ship 12, asteroids 40/20/10. The broad phase unions a
// 3×3 block of 80px cells, so some pairs straddle a cell boundary.
const dt = 1 / 60;
// Bullet cases keep the ship in the far corner, clear of every asteroid.
const field: Pick<State, "bounds" | "ship"> = { bounds: [800, 600], ship: Ship.spawn([750, 550]) };
// Ship cases: 200×200 → respawn at [100,100].
const small: Pick<State, "bounds"> = { bounds: [200, 200] };
const respawned = Ship.spawn([100, 100]);

export const cases: Conformance.SpecCases<State, typeof collision> = {
  cases: [
    {
      name: "destroys bullet + asteroid, scores, and spawns split children (large → 2 medium)",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], size: "large" }],
        ]),
      },
      args: { dt },
      after: {
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
      args: { dt },
      after: {
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
      },
      args: { dt },
      after: { entities: new Map(), score: 100 },
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
      args: { dt },
      after: {},
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
      },
      args: { dt },
      after: {
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
      },
      args: { dt },
      after: { entities: new Map(), score: 200 },
    },
    {
      // One bullet destroys the large (→ 2 medium). The second finds no original
      // target — children spawned this same pass are not yet hittable — so it survives.
      name: "split children are not hittable by another bullet in the same pass",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [3, { position: [50, 50], velocity: [0, 0], size: "large" }],
        ]),
      },
      args: { dt },
      after: {
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
      },
      args: { dt },
      after: {
        entities: new Map([
          [1, { position: [42, 0], velocity: [0, 0], size: "medium" }],
          [2, { position: [42, 0], velocity: [0, 0], size: "medium" }],
        ]),
        score: 20,
      },
    },
    {
      name: "just beyond the radius sum is no hit",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [0, 0], velocity: [0, 0], age: 0 }],
          [2, { position: [43, 0], velocity: [0, 0], size: "large" }],
        ]),
      },
      args: { dt },
      after: {},
    },
    {
      // Bullet in cell x=0 (79/80), asteroid in cell x=1 (81/80), 2px apart.
      name: "registers a hit across a cell boundary",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [79, 100], velocity: [0, 0], age: 0 }],
          [2, { position: [81, 100], velocity: [0, 0], size: "large" }],
        ]),
      },
      args: { dt },
      after: {
        entities: new Map([
          [1, { position: [81, 100], velocity: [0, 0], size: "medium" }],
          [2, { position: [81, 100], velocity: [0, 0], size: "medium" }],
        ]),
        score: 20,
      },
    },
    {
      // Over dt=1/60 the bullet travels 50px: prev = [50,0]. Both endpoints are 25px
      // from the medium at [25,0] — outside the 22px radius sum, so a point test
      // misses; the travelled segment crosses it, so a swept test hits.
      name: "a fast bullet whose path sweeps through a medium destroys it (no tunnelling)",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [0, 0], velocity: [-3000, 0], age: 0 }],
          [2, { position: [25, 0], velocity: [0, 0], size: "medium" }],
        ]),
      },
      args: { dt },
      after: {
        entities: new Map([
          [1, { position: [25, 0], velocity: [0, 0], size: "small" }],
          [2, { position: [25, 0], velocity: [0, 0], size: "small" }],
        ]),
        score: 50,
      },
    },
    {
      name: "an asteroid on the ship costs a life and respawns it at centre",
      before: {
        ...small,
        ship: { position: [10, 10], velocity: [5, 5], rotation: 1 },
        entities: new Map([[1, { position: [10, 10], velocity: [0, 0], size: "large" }]]),
      },
      args: { dt },
      after: { ship: respawned, lives: 2 },
    },
    {
      name: "several asteroids on the ship cost exactly one life",
      before: {
        ...small,
        ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
        entities: new Map([
          [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
          [2, { position: [20, 10], velocity: [0, 0], size: "large" }],
        ]),
      },
      args: { dt },
      after: { ship: respawned, lives: 2 },
    },
    {
      name: "no asteroid touching the ship is a no-op",
      before: {
        ...small,
        ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [500, 500], velocity: [0, 0], size: "large" }]]),
      },
      args: { dt },
      after: {},
    },
    {
      name: "an asteroid just out of the ship's reach is a no-op",
      before: {
        ...small,
        ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [160, 100], velocity: [0, 0], size: "large" }]]), // 60 > 52
      },
      args: { dt },
      after: {},
    },
    {
      name: "the last life drops lives to zero, and the ship still respawns",
      before: {
        ...small,
        ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [10, 10], velocity: [0, 0], size: "large" }]]),
        lives: 1,
      },
      args: { dt },
      after: { ship: respawned, lives: 0 },
    },
    {
      name: "boundary: distance exactly equal to the radius sum still counts as a hit",
      before: {
        ...small,
        ship: { position: [0, 0], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [52, 0], velocity: [0, 0], size: "large" }]]),
      },
      args: { dt },
      after: { ship: respawned, lives: 2 },
    },
    {
      name: "bullet hits resolve first: a destroyed asteroid can't strike the ship",
      before: {
        ...small,
        ship: respawned,
        entities: new Map([
          [1, { position: [100, 100], velocity: [0, 0], age: 0 }],
          [2, { position: [100, 100], velocity: [0, 0], size: "small" }],
        ]),
      },
      args: { dt },
      after: { entities: new Map(), score: 100 },
    },
    {
      name: "does nothing once the game is over",
      before: {
        ...small,
        ship: respawned,
        entities: new Map([
          [1, { position: [50, 50], velocity: [0, 0], age: 0 }],
          [2, { position: [50, 50], velocity: [0, 0], size: "small" }],
          [3, { position: [100, 100], velocity: [0, 0], size: "large" }],
        ]),
        lives: 0,
      },
      args: { dt },
      after: {},
    },
  ],
};
