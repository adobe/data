// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { lifetime } from "./lifetime.js";
import { Bullet } from "../data/values/bullet/bullet.js";
import { Input } from "../data/values/input/input.js";

// Cases for the `lifetime` system. `Bullet.lifetime` is 1.2; the 100×100 field forces
// wrap. A fired bullet leaves the nose (position + facing·12) at 400px/s and is
// advanced the same tick.
const field: Pick<State, "bounds"> = { bounds: [100, 100] };
const trigger: Input = { turn: 0, thrust: false, fire: true };

export const cases: Conformance.SpecCases<State, typeof lifetime> = {
  cases: [
    {
      name: "moves and ages a live bullet",
      before: { ...field, entities: new Map([[1, { position: [10, 50], velocity: [100, 0], age: 0 }]]) },
      args: { dt: 0.1, input: Input.none },
      after: { entities: new Map([[1, { position: [20, 50], velocity: [100, 0], age: 0.1 }]]) },
    },
    {
      name: "wraps a bullet across the right edge",
      before: { ...field, entities: new Map([[1, { position: [95, 50], velocity: [100, 0], age: 0 }]]) },
      args: { dt: 0.1, input: Input.none },
      after: { entities: new Map([[1, { position: [5, 50], velocity: [100, 0], age: 0.1 }]]) },
    },
    {
      name: "drops a bullet that expires this tick (age + dt ≥ lifetime)",
      before: { ...field, entities: new Map([[1, { position: [10, 50], velocity: [100, 0], age: Bullet.lifetime }]]) },
      args: { dt: 0.1, input: Input.none },
      after: { entities: new Map() },
    },
    {
      name: "keeps and ages a bullet still under its lifetime",
      before: { ...field, entities: new Map([[1, { position: [10, 50], velocity: [0, 0], age: 1.0 }]]) },
      args: { dt: 0.1, input: Input.none },
      after: { entities: new Map([[1, { position: [10, 50], velocity: [0, 0], age: 1.1 }]]) },
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
      args: { dt: 0.1, input: Input.none },
      after: { entities: new Map([[1, { position: [20, 50], velocity: [100, 0], age: 0.1 }]]) },
    },
    {
      name: "leaves asteroids to `movement`",
      before: { ...field, entities: new Map([[1, { position: [10, 10], velocity: [30, 0], size: "large" }]]) },
      args: { dt: 0.1, input: Input.none },
      after: { entities: new Map([[1, { position: [10, 10], velocity: [30, 0], size: "large" }]]) },
    },
    {
      name: "fires from the nose and advances the new bullet this tick",
      before: { bounds: [400, 400], ship: { position: [100, 100], velocity: [0, 0], rotation: 0 } },
      args: { dt: 0.1, input: trigger },
      after: { entities: new Map([[1, { position: [152, 100], velocity: [400, 0], age: 0.1 }]]) },
    },
  ],
};
