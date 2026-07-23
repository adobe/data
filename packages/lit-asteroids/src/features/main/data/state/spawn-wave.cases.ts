// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.spawnWave` (no args),
// shared with the ecs `spawnWave` transaction. When the field is clear it bumps
// the wave and spawns a ring of large asteroids around the centre, each
// drifting tangentially at 60px/s; while asteroids remain it is a no-op. Field
// 200×200 → centre [100,100], ring radius 80. From wave 0 the count is
// asteroidsFor(1)=4, so the ring lands on the four clean quadrant angles and
// every `after` position/velocity is exact.
const field = { ...State.create(), bounds: [200, 200] as [number, number] };

export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "spawns the next wave of large asteroids when the field is clear",
    before: { ...field, asteroids: [], wave: 0 },
    args: undefined,
    after: {
      ...field,
      wave: 1,
      asteroids: [
        { position: [180, 100], velocity: [0, 60], size: "large" },
        { position: [100, 180], velocity: [-60, 0], size: "large" },
        { position: [20, 100], velocity: [0, -60], size: "large" },
        { position: [100, 20], velocity: [60, 0], size: "large" },
      ],
    },
  },
  {
    name: "does nothing while asteroids still remain",
    before: {
      ...field,
      wave: 1,
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
    },
    args: undefined,
    after: {
      ...field,
      wave: 1,
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
    },
  },
];
