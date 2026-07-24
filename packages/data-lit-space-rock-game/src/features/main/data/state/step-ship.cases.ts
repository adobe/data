// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import type { Input } from "../input/input.js";

// Spec-owned `{ before, args, after }` cases for `State.stepShip`, shared with
// the ecs system conformance (the `control` + ship half of `movement` reproduce
// this). Full-`State` before/after; the generic-slice signature lets them flow
// through. Geometry is chosen so every `after` is exact (turnRate 3,
// thrustAccel 200, field 100×100 to force wrap).
type Args = { readonly dt: number; readonly input: Input };
const field = { ...State.create(), bounds: [100, 100] as [number, number] };
const idle: Input = { turn: 0, thrust: false, fire: false };

export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "turns right by a positive turn input",
    before: { ...field, ship: { position: [50, 50], velocity: [0, 0], rotation: 0 } },
    args: { dt: 1, input: { turn: 1, thrust: false, fire: false } },
    after: { ...field, ship: { position: [50, 50], velocity: [0, 0], rotation: 3 } },
  },
  {
    name: "turns left by a negative turn input",
    before: { ...field, ship: { position: [50, 50], velocity: [0, 0], rotation: 0 } },
    args: { dt: 1, input: { turn: -1, thrust: false, fire: false } },
    after: { ...field, ship: { position: [50, 50], velocity: [0, 0], rotation: -3 } },
  },
  {
    name: "no turn holds rotation and coasts by velocity",
    before: { ...field, ship: { position: [50, 50], velocity: [10, 0], rotation: 0.7 } },
    args: { dt: 1, input: idle },
    after: { ...field, ship: { position: [60, 50], velocity: [10, 0], rotation: 0.7 } },
  },
  {
    name: "thrusts along the facing, then coasts by the new velocity",
    before: { ...field, ship: { position: [50, 50], velocity: [0, 0], rotation: 0 } },
    args: { dt: 0.1, input: { turn: 0, thrust: true, fire: false } },
    after: { ...field, ship: { position: [52, 50], velocity: [20, 0], rotation: 0 } },
  },
  {
    name: "wraps across the right edge",
    before: { ...field, ship: { position: [95, 50], velocity: [100, 0], rotation: 0 } },
    args: { dt: 0.1, input: idle },
    after: { ...field, ship: { position: [5, 50], velocity: [100, 0], rotation: 0 } },
  },
  {
    name: "wraps across the top edge (negative wrap)",
    before: { ...field, ship: { position: [5, 5], velocity: [0, -100], rotation: 0 } },
    args: { dt: 0.1, input: idle },
    after: { ...field, ship: { position: [5, 95], velocity: [0, -100], rotation: 0 } },
  },
  {
    // Turn then thrust: −3 turns to 0, and thrust must use the NEW rotation 0
    // (facing +x → velocity [200,0]); using the old −3 would point elsewhere.
    name: "turn composes before thrust — thrust uses the post-turn rotation",
    before: { ...field, ship: { position: [50, 50], velocity: [0, 0], rotation: -3 } },
    args: { dt: 1, input: { turn: 1, thrust: true, fire: false } },
    after: { ...field, ship: { position: [50, 50], velocity: [200, 0], rotation: 0 } },
  },
];
