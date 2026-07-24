// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.resolveBulletHits`
// (args = the frame `dt`), shared with the ecs `hitAsteroid` transaction
// (dispatched once per overlapping bullet by the collision system). Detection is
// SWEPT: each bullet's path this frame is the segment [position - velocity*dt,
// position], and it destroys the first asteroid that segment passes through,
// scores it (large 20 / medium 50 / small 100), and replaces it with its split
// children (large→2 medium, medium→2 small, small→none). Stationary parents
// (velocity [0,0]) give children velocity [0,0], so every `after` is exact.
// Bullet.radius 2, asteroid radii 40/20/10. Every case keeps each bullet
// overlapping at most one asteroid, so the outcome is order-independent (the ecs
// broad phase need not match the spec's order). Cases with velocity [0,0]
// collapse the segment to a point (prev == position), so their expectations are
// exactly the old point-vs-circle ones; the final case exercises tunnelling.
const field = { ...State.create(), bounds: [800, 600] as [number, number] };

export const cases: readonly ConformanceCase<number>[] = [
  {
    name: "destroys bullet + asteroid, scores, and spawns split children (large → 2 medium)",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [50, 50], velocity: [0, 0], size: "medium" },
      ],
      score: 20,
    },
  },
  {
    name: "medium splits into two small",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "medium" }],
      score: 5,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "small" },
        { position: [50, 50], velocity: [0, 0], size: "small" },
      ],
      score: 55,
    },
  },
  {
    name: "the smallest tier is destroyed outright — no children",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "small" }],
      score: 0,
    },
    args: 1 / 60,
    after: { ...field, bullets: [], asteroids: [], score: 100 },
  },
  {
    name: "a bullet that hits nothing is left untouched",
    before: {
      ...field,
      bullets: [{ position: [10, 10], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [500, 500], velocity: [0, 0], size: "large" }],
      score: 7,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [{ position: [10, 10], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [500, 500], velocity: [0, 0], size: "large" }],
      score: 7,
    },
  },
  {
    name: "only the overlapping asteroid is hit; distant ones remain",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "large" },
        { position: [500, 500], velocity: [0, 0], size: "small" },
      ],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [500, 500], velocity: [0, 0], size: "small" },
      ],
      score: 20,
    },
  },
  {
    name: "two bullets each destroy their own asteroid",
    before: {
      ...field,
      bullets: [
        { position: [50, 50], velocity: [0, 0], age: 0 },
        { position: [500, 500], velocity: [0, 0], age: 0 },
      ],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "small" },
        { position: [500, 500], velocity: [0, 0], size: "small" },
      ],
      score: 0,
    },
    args: 1 / 60,
    after: { ...field, bullets: [], asteroids: [], score: 200 },
  },
  {
    name: "split children are not hittable by another bullet in the same pass",
    before: {
      ...field,
      bullets: [
        { position: [50, 50], velocity: [0, 0], age: 0 },
        { position: [50, 50], velocity: [0, 0], age: 0 },
      ],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      // One bullet destroys the large (→ 2 medium). The second finds no
      // original target — the large is gone and its children, spawned this
      // same pass, are not yet hittable — so it survives. (Buggy behaviour let
      // it hit a fresh medium, chain-annihilating: [medium, small, small], 70.)
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [
        { position: [50, 50], velocity: [0, 0], size: "medium" },
        { position: [50, 50], velocity: [0, 0], size: "medium" },
      ],
      score: 20,
    },
  },
  {
    name: "boundary: distance exactly equal to the radius sum still overlaps",
    before: {
      ...field,
      bullets: [{ position: [0, 0], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [42, 0], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [42, 0], velocity: [0, 0], size: "medium" },
        { position: [42, 0], velocity: [0, 0], size: "medium" },
      ],
      score: 20,
    },
  },
  {
    name: "a fast bullet whose path sweeps through a medium destroys it (no tunnelling)",
    before: {
      ...field,
      // Over dt=1/60 the bullet travels 50px: prev = [0,0] - [-3000,0]/60 = [50,0].
      // Both endpoints ([50,0] end position, [0,0] current) are 25px from the
      // medium at [25,0] — outside the 22px (2+20) radius sum, so a point test at
      // the current position misses. The travelled segment crosses [25,0], so a
      // swept test hits.
      bullets: [{ position: [0, 0], velocity: [-3000, 0], age: 0 }],
      asteroids: [{ position: [25, 0], velocity: [0, 0], size: "medium" }],
      score: 0,
    },
    args: 1 / 60,
    after: {
      ...field,
      bullets: [],
      asteroids: [
        { position: [25, 0], velocity: [0, 0], size: "small" },
        { position: [25, 0], velocity: [0, 0], size: "small" },
      ],
      score: 50,
    },
  },
];
