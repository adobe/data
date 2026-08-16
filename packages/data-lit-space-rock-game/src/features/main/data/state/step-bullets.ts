// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
import { Bullet } from "../bullet/bullet.js";
import { Motion } from "../motion/motion.js";

// Advance every bullet one tick: drop the ones that expire this tick, and move
// + age + wrap the survivors (keeping each survivor's entity id). Non-bullet
// entities pass through untouched.
export const stepBullets = (
  state: Pick<State, "entities" | "bounds">,
  dt: number,
): Pick<State, "entities"> => {
  const entities = new Map(state.entities);
  for (const [id, value] of state.entities) {
    if (!Bullet.is(value)) continue;
    if (Bullet.isExpired(value.age, dt)) {
      entities.delete(id);
      continue;
    }
    entities.set(id, {
      ...value,
      position: Motion.wrap(
        Motion.advance(value.position, value.velocity, dt),
        state.bounds,
      ),
      age: value.age + dt,
    });
  }
  return { entities };
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
      entities: new Map([[1, { position: [10, 50], velocity: [100, 0], age: 0 }]]),
    },
    args: 0.1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("b"), { position: [20, 50], velocity: [100, 0], age: 0.1 }],
      ]),
    },
  },
  {
    name: "wraps a bullet across the right edge",
    before: {
      ...field,
      entities: new Map([[1, { position: [95, 50], velocity: [100, 0], age: 0 }]]),
    },
    args: 0.1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("b"), { position: [5, 50], velocity: [100, 0], age: 0.1 }],
      ]),
    },
  },
  {
    name: "drops a bullet that expires this tick (age + dt ≥ lifetime)",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [10, 50], velocity: [100, 0], age: Bullet.lifetime }],
      ]),
    },
    args: 0.1,
    after: { ...field, entities: new Map() },
  },
  {
    name: "keeps and ages a bullet still under its lifetime",
    before: {
      ...field,
      entities: new Map([[1, { position: [10, 50], velocity: [0, 0], age: 1.0 }]]),
    },
    args: 0.1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("b"), { position: [10, 50], velocity: [0, 0], age: 1.1 }],
      ]),
    },
  },
  {
    name: "advances survivors and drops only the expired bullet",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [10, 50], velocity: [100, 0], age: 0 }],
        [2, { position: [10, 60], velocity: [100, 0], age: Bullet.lifetime }],
      ]),
    },
    args: 0.1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("b"), { position: [20, 50], velocity: [100, 0], age: 0.1 }],
      ]),
    },
  },
  {
    name: "an empty list stays empty",
    before: { ...field, entities: new Map() },
    args: 0.1,
    after: { ...field, entities: new Map() },
  },
];
