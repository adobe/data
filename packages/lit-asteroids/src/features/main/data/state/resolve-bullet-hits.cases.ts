// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.resolveBulletHits` (no
// args), shared with the ecs `hitAsteroid` transaction (dispatched once per
// overlapping bullet by the collision system). Each bullet destroys the first
// asteroid it overlaps, scores it (large 20 / medium 50 / small 100), and
// replaces it with its split children (large→2 medium, medium→2 small,
// small→none). Stationary parents (velocity [0,0]) give children velocity
// [0,0], so every `after` is exact. Bullet.radius 2, asteroid radii 40/20/10.
// Every case keeps each bullet overlapping at most one asteroid, so the outcome
// is order-independent (the ecs broad phase need not match the spec's order).
const field = { ...State.create(), bounds: [800, 600] as [number, number] };

export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "destroys bullet + asteroid, scores, and spawns split children (large → 2 medium)",
    before: {
      ...field,
      bullets: [{ position: [50, 50], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [50, 50], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: undefined,
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
    args: undefined,
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
    args: undefined,
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
    args: undefined,
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
    args: undefined,
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
    args: undefined,
    after: { ...field, bullets: [], asteroids: [], score: 200 },
  },
  {
    name: "boundary: distance exactly equal to the radius sum still overlaps",
    before: {
      ...field,
      bullets: [{ position: [0, 0], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [42, 0], velocity: [0, 0], size: "large" }],
      score: 0,
    },
    args: undefined,
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
];
