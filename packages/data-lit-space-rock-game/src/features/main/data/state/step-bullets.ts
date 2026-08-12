// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
import { Bullet } from "../bullet/bullet.js";
import { Motion } from "../motion/motion.js";

// Advance every bullet one tick: drop the ones that expire this tick, and move
// + age + wrap the survivors.
export const stepBullets = (
  state: Pick<State, "bullets" | "bounds">,
  dt: number,
): Pick<State, "bullets"> => {
  const bullets = new Set(
    [...state.bullets]
      .filter((b) => !Bullet.isExpired(b.age, dt))
      .map((b) => ({
        ...b,
        position: Motion.wrap(
          Motion.advance(b.position, b.velocity, dt),
          state.bounds,
        ),
        age: b.age + dt,
      })),
  );
  return { bullets };
};

// Spec-owned cases, shared with the ecs system conformance (the `lifetime`
// advance/age/expire path reproduces this). `Bullet.lifetime` is 1.2; the 100×100
// field forces wrap. Covers move+age, wrap, expiry on the boundary, survival just
// under it, mixed drop, and the empty list.
const field = { ...create(), bounds: [100, 100] as [number, number] };

export const cases: Conformance<typeof stepBullets> = [
  {
    name: "moves and ages a live bullet",
    before: {
      ...field,
      bullets: new Set([{ position: [10, 50], velocity: [100, 0], age: 0 }]),
    },
    args: 0.1,
    after: {
      ...field,
      bullets: new Set([{ position: [20, 50], velocity: [100, 0], age: 0.1 }]),
    },
  },
  {
    name: "wraps a bullet across the right edge",
    before: {
      ...field,
      bullets: new Set([{ position: [95, 50], velocity: [100, 0], age: 0 }]),
    },
    args: 0.1,
    after: {
      ...field,
      bullets: new Set([{ position: [5, 50], velocity: [100, 0], age: 0.1 }]),
    },
  },
  {
    name: "drops a bullet that expires this tick (age + dt ≥ lifetime)",
    before: {
      ...field,
      bullets: new Set([
        { position: [10, 50], velocity: [100, 0], age: Bullet.lifetime },
      ]),
    },
    args: 0.1,
    after: { ...field, bullets: new Set() },
  },
  {
    name: "keeps and ages a bullet still under its lifetime",
    before: {
      ...field,
      bullets: new Set([{ position: [10, 50], velocity: [0, 0], age: 1.0 }]),
    },
    args: 0.1,
    after: {
      ...field,
      bullets: new Set([{ position: [10, 50], velocity: [0, 0], age: 1.1 }]),
    },
  },
  {
    name: "advances survivors and drops only the expired bullet",
    before: {
      ...field,
      bullets: new Set([
        { position: [10, 50], velocity: [100, 0], age: 0 },
        { position: [10, 60], velocity: [100, 0], age: Bullet.lifetime },
      ]),
    },
    args: 0.1,
    after: {
      ...field,
      bullets: new Set([{ position: [20, 50], velocity: [100, 0], age: 0.1 }]),
    },
  },
  {
    name: "an empty list stays empty",
    before: { ...field, bullets: new Set() },
    args: 0.1,
    after: { ...field, bullets: new Set() },
  },
];
