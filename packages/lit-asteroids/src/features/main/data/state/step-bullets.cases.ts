// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { Bullet } from "../bullet/bullet.js";

// Spec-owned `{ before, args, after }` cases for `State.stepBullets` (args = dt).
// Shared with the ecs system conformance (the `lifetime` advance/age/expire
// path reproduces this). `Bullet.lifetime` is 1.2; the 100×100 field forces
// wrap. Covers move+age, wrap (both directions), expiry on the boundary,
// survival just under it, mixed drop, and the empty list.
const field = { ...State.create(), bounds: [100, 100] as [number, number] };

export const cases: readonly ConformanceCase<number>[] = [
  {
    name: "moves and ages a live bullet",
    before: { ...field, bullets: [{ position: [10, 50], velocity: [100, 0], age: 0 }] },
    args: 0.1,
    after: { ...field, bullets: [{ position: [20, 50], velocity: [100, 0], age: 0.1 }] },
  },
  {
    name: "wraps a bullet across the right edge",
    before: { ...field, bullets: [{ position: [95, 50], velocity: [100, 0], age: 0 }] },
    args: 0.1,
    after: { ...field, bullets: [{ position: [5, 50], velocity: [100, 0], age: 0.1 }] },
  },
  {
    name: "drops a bullet that expires this tick (age + dt ≥ lifetime)",
    before: { ...field, bullets: [{ position: [10, 50], velocity: [100, 0], age: Bullet.lifetime }] },
    args: 0.1,
    after: { ...field, bullets: [] },
  },
  {
    name: "keeps and ages a bullet still under its lifetime",
    before: { ...field, bullets: [{ position: [10, 50], velocity: [0, 0], age: 1.0 }] },
    args: 0.1,
    after: { ...field, bullets: [{ position: [10, 50], velocity: [0, 0], age: 1.1 }] },
  },
  {
    name: "advances survivors and drops only the expired bullet",
    before: {
      ...field,
      bullets: [
        { position: [10, 50], velocity: [100, 0], age: 0 },
        { position: [10, 60], velocity: [100, 0], age: Bullet.lifetime },
      ],
    },
    args: 0.1,
    after: { ...field, bullets: [{ position: [20, 50], velocity: [100, 0], age: 0.1 }] },
  },
  {
    name: "an empty list stays empty",
    before: { ...field, bullets: [] },
    args: 0.1,
    after: { ...field, bullets: [] },
  },
];
