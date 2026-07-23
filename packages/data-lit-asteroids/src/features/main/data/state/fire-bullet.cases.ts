// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.fireBullet` (no args),
// shared with the ecs `fireBullet` transaction. A bullet leaves the ship's nose
// (position + facing·Ship.radius=12) inheriting the ship's momentum plus
// Bullet.speed=400 along the facing. Rotation 0 → facing [1,0]; rotation −π/2 →
// facing [0,−1] (up). The existing bullets pass through untouched.
const field = { ...State.create(), bounds: [800, 600] as [number, number] };

export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "fires from a ship facing +x at rest",
    before: { ...field, ship: { position: [100, 100], velocity: [0, 0], rotation: 0 }, bullets: [] },
    args: undefined,
    after: {
      ...field,
      ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
      bullets: [{ position: [112, 100], velocity: [400, 0], age: 0 }],
    },
  },
  {
    name: "inherits the ship's momentum",
    before: { ...field, ship: { position: [100, 100], velocity: [10, 20], rotation: 0 }, bullets: [] },
    args: undefined,
    after: {
      ...field,
      ship: { position: [100, 100], velocity: [10, 20], rotation: 0 },
      bullets: [{ position: [112, 100], velocity: [410, 20], age: 0 }],
    },
  },
  {
    name: "appends without disturbing bullets already in flight",
    before: {
      ...field,
      ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
      bullets: [{ position: [0, 0], velocity: [1, 0], age: 0.2 }],
    },
    args: undefined,
    after: {
      ...field,
      ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
      bullets: [
        { position: [0, 0], velocity: [1, 0], age: 0.2 },
        { position: [112, 100], velocity: [400, 0], age: 0 },
      ],
    },
  },
  {
    name: "fires along the ship's facing (rotation −π/2 points up)",
    before: {
      ...field,
      ship: { position: [100, 100], velocity: [0, 0], rotation: -Math.PI / 2 },
      bullets: [],
    },
    args: undefined,
    after: {
      ...field,
      ship: { position: [100, 100], velocity: [0, 0], rotation: -Math.PI / 2 },
      bullets: [{ position: [100, 88], velocity: [0, -400], age: 0 }],
    },
  },
];
