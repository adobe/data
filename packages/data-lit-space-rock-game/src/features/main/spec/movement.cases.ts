// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { movement } from "./movement.js";
import { Size } from "../data/values/size/size.js";

// Cases for the `movement` system. The 100×100 field forces wrap; bodies drift by
// constant velocity, so every `after` is exact. The default ship idles at the origin.
const field: Pick<State, "bounds"> = { bounds: [100, 100] };

export const cases: Conformance.SpecCases<State, typeof movement> = {
  cases: [
    {
      name: "coasts the ship by its velocity",
      before: { ...field, ship: { position: [50, 50], velocity: [10, 0], rotation: 0.7 } },
      args: { dt: 1 },
      after: { ship: { position: [60, 50], velocity: [10, 0], rotation: 0.7 } },
    },
    {
      name: "wraps the ship across the right edge",
      before: { ...field, ship: { position: [95, 50], velocity: [100, 0], rotation: 0 } },
      args: { dt: 0.1 },
      after: { ship: { position: [5, 50], velocity: [100, 0], rotation: 0 } },
    },
    {
      name: "wraps the ship across the top edge (negative wrap)",
      before: { ...field, ship: { position: [5, 5], velocity: [0, -100], rotation: 0 } },
      args: { dt: 0.1 },
      after: { ship: { position: [5, 95], velocity: [0, -100], rotation: 0 } },
    },
    {
      name: "drifts an asteroid by its velocity",
      before: { ...field, entities: new Map([[1, { position: [10, 10], velocity: [30, 0], size: Size.largest }]]) },
      args: { dt: 1 },
      after: { entities: new Map([[1, { position: [40, 10], velocity: [30, 0], size: Size.largest }]]) },
    },
    {
      name: "wraps an asteroid around the toroidal field",
      before: { ...field, entities: new Map([[1, { position: [80, 80], velocity: [50, 50], size: Size.largest }]]) },
      args: { dt: 1 },
      after: { entities: new Map([[1, { position: [30, 30], velocity: [50, 50], size: Size.largest }]]) },
    },
    {
      name: "wraps an asteroid negatively across the left edge",
      before: { ...field, entities: new Map([[1, { position: [10, 10], velocity: [-50, 0], size: "medium" }]]) },
      args: { dt: 1 },
      after: { entities: new Map([[1, { position: [60, 10], velocity: [-50, 0], size: "medium" }]]) },
    },
    {
      name: "advances several asteroids of different sizes independently",
      before: {
        ...field,
        entities: new Map([
          [1, { position: [10, 10], velocity: [10, 0], size: "large" }],
          [2, { position: [20, 20], velocity: [0, 10], size: "small" }],
        ]),
      },
      args: { dt: 1 },
      after: {
        entities: new Map([
          [1, { position: [20, 10], velocity: [10, 0], size: "large" }],
          [2, { position: [20, 30], velocity: [0, 10], size: "small" }],
        ]),
      },
    },
    {
      name: "leaves bullets to `lifetime`",
      before: { ...field, entities: new Map([[1, { position: [10, 10], velocity: [10, 0], age: 0 }]]) },
      args: { dt: 1 },
      after: { entities: new Map([[1, { position: [10, 10], velocity: [10, 0], age: 0 }]]) },
    },
    {
      name: "does nothing once the game is over",
      before: {
        ...field,
        ship: { position: [50, 50], velocity: [10, 0], rotation: 0 },
        entities: new Map([[1, { position: [10, 10], velocity: [30, 0], size: "large" }]]),
        lives: 0,
      },
      args: { dt: 1 },
      after: {},
    },
  ],
};
