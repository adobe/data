// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Input } from "../data/values/input/input.js";
import { Ship } from "../data/values/ship/ship.js";
import { whilePlaying } from "./while-playing.js";

// The `control` system: turn the ship, then thrust along the post-turn facing.
export const control = (
  state: Pick<State, "ship" | "lives">,
  { dt, input }: { readonly dt: number; readonly input: Input },
): Pick<State, "ship"> =>
  whilePlaying(state, ({ ship }) => {
    const rotation = Ship.turn(ship.rotation, input.turn, dt);
    const velocity = input.thrust ? Ship.thrust(ship.velocity, rotation, dt) : ship.velocity;
    return { ship: { position: ship.position, velocity, rotation } };
  });
