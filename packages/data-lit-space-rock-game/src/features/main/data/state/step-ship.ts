// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
import { Ship } from "../ship/ship.js";
import { Input } from "../input/input.js";
import { Motion } from "../motion/motion.js";

// Advance the ship one tick: turn, optionally thrust, then coast by its velocity
// and wrap at the screen edges. `dt` and `input` are bundled into one args object
// (second parameter) so the co-located conformance cases derive their `args` type
// straight from this signature (`Conformance<typeof stepShip>`).
export const stepShip = <T extends Pick<State, "ship" | "bounds">>(
  state: T,
  { dt, input }: { readonly dt: number; readonly input: Input },
): T => {
  const { ship } = state;
  const rotation = Ship.turn(ship.rotation, input.turn, dt);
  const velocity = input.thrust ? Ship.thrust(ship.velocity, rotation, dt) : ship.velocity;
  const position = Motion.wrap(Motion.advance(ship.position, velocity, dt), state.bounds);
  return { ...state, ship: { position, velocity, rotation } };
};

// Spec-owned cases, shared with the ecs system conformance (the `control` + ship
// half of `movement` reproduce this). Geometry chosen so every `after` is exact
// (turnRate 3, thrustAccel 200, field 100×100 to force wrap).
const field = { ...create(), bounds: [100, 100] as [number, number] };
const idle: Input = { turn: 0, thrust: false, fire: false };

export const cases: Conformance<typeof stepShip> = [
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
