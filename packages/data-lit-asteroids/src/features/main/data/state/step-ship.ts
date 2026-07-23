// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Ship } from "../ship/ship.js";
import { Input } from "../input/input.js";
import { Motion } from "../motion/motion.js";

// Advance the ship one tick: turn, optionally thrust, then coast by its
// velocity and wrap at the screen edges.
export const stepShip = <T extends Pick<State, "ship" | "bounds">>(
  state: T,
  dt: number,
  input: Input,
): T => {
  const { ship } = state;
  const rotation = Ship.turn(ship.rotation, input.turn, dt);
  const velocity = input.thrust ? Ship.thrust(ship.velocity, rotation, dt) : ship.velocity;
  const position = Motion.wrap(Motion.advance(ship.position, velocity, dt), state.bounds);
  return { ...state, ship: { position, velocity, rotation } };
};
