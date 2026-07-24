// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { Size } from "../size/size.js";

// Spec-owned `{ before, args, after }` cases for `State.stepAsteroids`
// (args = dt). Shared with the ecs system conformance (the asteroid half of
// `movement` reproduces this). The 100×100 field forces wrap. Asteroids drift
// by constant velocity, so `after` is exact.
const field = { ...State.create(), bounds: [100, 100] as [number, number] };

export const cases: readonly ConformanceCase<number>[] = [
  {
    name: "drifts an asteroid by its velocity",
    before: { ...field, asteroids: [{ position: [10, 10], velocity: [30, 0], size: Size.largest }] },
    args: 1,
    after: { ...field, asteroids: [{ position: [40, 10], velocity: [30, 0], size: Size.largest }] },
  },
  {
    name: "wraps an asteroid around the toroidal field",
    before: { ...field, asteroids: [{ position: [80, 80], velocity: [50, 50], size: Size.largest }] },
    args: 1,
    after: { ...field, asteroids: [{ position: [30, 30], velocity: [50, 50], size: Size.largest }] },
  },
  {
    name: "wraps negatively across the left edge",
    before: { ...field, asteroids: [{ position: [10, 10], velocity: [-50, 0], size: "medium" }] },
    args: 1,
    after: { ...field, asteroids: [{ position: [60, 10], velocity: [-50, 0], size: "medium" }] },
  },
  {
    name: "advances several asteroids of different sizes independently",
    before: {
      ...field,
      asteroids: [
        { position: [10, 10], velocity: [10, 0], size: "large" },
        { position: [20, 20], velocity: [0, 10], size: "small" },
      ],
    },
    args: 1,
    after: {
      ...field,
      asteroids: [
        { position: [20, 10], velocity: [10, 0], size: "large" },
        { position: [20, 30], velocity: [0, 10], size: "small" },
      ],
    },
  },
  {
    name: "an empty field stays empty",
    before: { ...field, asteroids: [] },
    args: 1,
    after: { ...field, asteroids: [] },
  },
];
