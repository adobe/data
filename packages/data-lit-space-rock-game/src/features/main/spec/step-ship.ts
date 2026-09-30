// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Ship } from "../data/values/ship/ship.js";
import type { Input } from "../data/values/input/input.js";
import { Motion } from "../data/values/motion/motion.js";

// Advance the ship one tick: turn, optionally thrust, then coast by its velocity
// and wrap at the screen edges. `dt` and `input` are bundled into one args object
// (second parameter) so the co-located conformance cases derive their `args` type
// straight from this signature (`Conformance<typeof stepShip>`).
export const stepShip = (
  state: Pick<State, "ship" | "bounds">,
  { dt, input }: { readonly dt: number; readonly input: Input },
): Pick<State, "ship"> => {
  const { ship } = state;
  const rotation = Ship.turn(ship.rotation, input.turn, dt);
  const velocity = input.thrust
    ? Ship.thrust(ship.velocity, rotation, dt)
    : ship.velocity;
  const position = Motion.wrap(
    Motion.advance(ship.position, velocity, dt),
    state.bounds,
  );
  return { ship: { position, velocity, rotation } };
};
