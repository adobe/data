// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Motion } from "../data/values/motion/motion.js";
import { stepAsteroids } from "./step-asteroids.js";
import { whilePlaying } from "./while-playing.js";

// The `movement` system: advance + wrap the ship and every asteroid. Bullets move
// in `lifetime`.
export const movement = (
  state: Pick<State, "ship" | "entities" | "bounds" | "lives">,
  { dt }: { readonly dt: number },
): Pick<State, "ship" | "entities"> =>
  whilePlaying(state, (playing) => {
    const { ship, bounds } = playing;
    return {
      ship: { ...ship, position: Motion.wrap(Motion.advance(ship.position, ship.velocity, dt), bounds) },
      ...stepAsteroids(playing, { dt }),
    };
  });
