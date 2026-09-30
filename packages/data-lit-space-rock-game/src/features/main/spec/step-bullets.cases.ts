// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { stepBullets } from "./step-bullets.js";
import { create } from "./create.js";
import { Bullet } from "../data/values/bullet/bullet.js";

// Cases for the `stepBullets` helper `step` composes (args `{ dt }`). `Bullet.lifetime` is 1.2; the 100×100
// field forces wrap. Covers move+age, wrap, expiry on the boundary, survival just
// under it, mixed drop, and the empty list.
const field = { ...create(), bounds: [100, 100] as [number, number] };

export const cases: Conformance.SpecCases<State, typeof stepBullets> = {
  cases: [
    {
      name: "moves and ages a live bullet",
      before: { ...field, entities: new Map([[1, { position: [10, 50], velocity: [100, 0], age: 0 }]]) },
      args: { dt: 0.1 },
      after: { ...field, entities: new Map([[1, { position: [20, 50], velocity: [100, 0], age: 0.1 }]]) },
    },
    {
      name: "wraps a bullet across the right edge",
      before: { ...field, entities: new Map([[1, { position: [95, 50], velocity: [100, 0], age: 0 }]]) },
      args: { dt: 0.1 },
      after: { ...field, entities: new Map([[1, { position: [5, 50], velocity: [100, 0], age: 0.1 }]]) },
    },
    {
      name: "drops a bullet that expires this tick (age + dt ≥ lifetime)",
      before: {
        ...field,
        entities: new Map([[1, { position: [10, 50], velocity: [100, 0], age: Bullet.lifetime }]]),
      },
      args: { dt: 0.1 },
      after: { ...field, entities: new Map() },
    },
    {
      name: "keeps and ages a bullet still under its lifetime",
      before: { ...field, entities: new Map([[1, { position: [10, 50], velocity: [0, 0], age: 1.0 }]]) },
      args: { dt: 0.1 },
      after: { ...field, entities: new Map([[1, { position: [10, 50], velocity: [0, 0], age: 1.1 }]]) },
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
      args: { dt: 0.1 },
      after: { ...field, entities: new Map([[1, { position: [20, 50], velocity: [100, 0], age: 0.1 }]]) },
    },
    {
      name: "an empty list stays empty",
      before: { ...field, entities: new Map() },
      args: { dt: 0.1 },
      after: { ...field, entities: new Map() },
    },
  ],
};
