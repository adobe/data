// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Asteroid } from "../data/values/asteroid/asteroid.js";
import { Motion } from "../data/values/motion/motion.js";

// Drift every asteroid one tick by its constant velocity, wrapping at edges
// (keeping each asteroid's entity id). Non-asteroid entities pass through. `dt` is
// bundled into one args object (second parameter) as the conformance case model
// requires.
export const stepAsteroids = (
  state: Pick<State, "entities" | "bounds">,
  { dt }: { readonly dt: number },
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
