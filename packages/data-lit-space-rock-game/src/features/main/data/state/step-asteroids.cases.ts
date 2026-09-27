// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { stepAsteroids } from "./step-asteroids.js";
import { create } from "./create.js";
import { Size } from "../size/size.js";

// Inert, spec-owned cases (args is `{ dt }`). `stepAsteroids` has no ecs op — the
// asteroid half of the per-frame `movement` system reproduces it — so `checkFeature`
// skips it; the pure `checkSpec` verifies it here. The 100×100 field forces wrap.
// Asteroids drift by constant velocity, so `after` is exact.
const field = { ...create(), bounds: [100, 100] as [number, number] };

export const cases: Conformance.SpecCases<State, typeof stepAsteroids> = {
  cases: [
    {
      name: "drifts an asteroid by its velocity",
      before: { ...field, entities: new Map([[1, { position: [10, 10], velocity: [30, 0], size: Size.largest }]]) },
      args: { dt: 1 },
      after: { ...field, entities: new Map([[1, { position: [40, 10], velocity: [30, 0], size: Size.largest }]]) },
    },
    {
      name: "wraps an asteroid around the toroidal field",
      before: { ...field, entities: new Map([[1, { position: [80, 80], velocity: [50, 50], size: Size.largest }]]) },
      args: { dt: 1 },
      after: { ...field, entities: new Map([[1, { position: [30, 30], velocity: [50, 50], size: Size.largest }]]) },
    },
    {
      name: "wraps negatively across the left edge",
      before: { ...field, entities: new Map([[1, { position: [10, 10], velocity: [-50, 0], size: "medium" }]]) },
      args: { dt: 1 },
      after: { ...field, entities: new Map([[1, { position: [60, 10], velocity: [-50, 0], size: "medium" }]]) },
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
        ...field,
        entities: new Map([
          [1, { position: [20, 10], velocity: [10, 0], size: "large" }],
          [2, { position: [20, 30], velocity: [0, 10], size: "small" }],
        ]),
      },
    },
    {
      name: "an empty field stays empty",
      before: { ...field, entities: new Map() },
      args: { dt: 1 },
      after: { ...field, entities: new Map() },
    },
  ],
};
