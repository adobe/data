// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Motion } from "../motion/motion.js";
import { Size } from "../size/size.js";

// Drift every asteroid one tick by its constant velocity, wrapping at edges
// (keeping each asteroid's entity id). Non-asteroid entities pass through.
export const stepAsteroids = (
  state: Pick<State, "entities" | "bounds">,
  dt: number,
): Pick<State, "entities"> => {
  const entities = new Map(state.entities);
  for (const [id, value] of state.entities) {
    if (!Asteroid.is(value)) continue;
    entities.set(id, {
      ...value,
      position: Motion.wrap(
        Motion.advance(value.position, value.velocity, dt),
        state.bounds,
      ),
    });
  }
  return { entities };
};

// Spec-owned cases, shared with the ecs system conformance (the asteroid half of
// `movement` reproduces this). The 100×100 field forces wrap. Asteroids drift by
// constant velocity, so `after` is exact.
const field = { ...create(), bounds: [100, 100] as [number, number] };

export const cases: Conformance<typeof stepAsteroids> = [
  {
    name: "drifts an asteroid by its velocity",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [10, 10], velocity: [30, 0], size: Size.largest }],
      ]),
    },
    args: 1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("a"), { position: [40, 10], velocity: [30, 0], size: Size.largest }],
      ]),
    },
  },
  {
    name: "wraps an asteroid around the toroidal field",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [80, 80], velocity: [50, 50], size: Size.largest }],
      ]),
    },
    args: 1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("a"), { position: [30, 30], velocity: [50, 50], size: Size.largest }],
      ]),
    },
  },
  {
    name: "wraps negatively across the left edge",
    before: {
      ...field,
      entities: new Map([
        [1, { position: [10, 10], velocity: [-50, 0], size: "medium" }],
      ]),
    },
    args: 1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("a"), { position: [60, 10], velocity: [-50, 0], size: "medium" }],
      ]),
    },
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
    args: 1,
    after: {
      ...field,
      entities: new Map([
        [Match.ref("a1"), { position: [20, 10], velocity: [10, 0], size: "large" }],
        [Match.ref("a2"), { position: [20, 30], velocity: [0, 10], size: "small" }],
      ]),
    },
  },
  {
    name: "an empty field stays empty",
    before: { ...field, entities: new Map() },
    args: 1,
    after: { ...field, entities: new Map() },
  },
];
