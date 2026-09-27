// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { stepShip } from "./step-ship.js";
import type { Input } from "../input/input.js";
import { create } from "./create.js";

// Inert, spec-owned cases (args is `{ dt, input }`). `stepShip` has no ecs op — the
// per-frame system loop (`control` + the ship half of `movement`) reproduces it —
// so `checkFeature` skips it; the pure `checkSpec` verifies it here. Geometry chosen
// so every `after` is exact (turnRate 3, thrustAccel 200, field 100×100 to force
// wrap).
const field = { ...create(), bounds: [100, 100] as [number, number] };
const idle: Input = { turn: 0, thrust: false, fire: false };

export const cases: Conformance.SpecCases<State, typeof stepShip> = {
  cases: [
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
  ],
};
