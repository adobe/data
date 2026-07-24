// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Motion } from "../motion/motion.js";

// Drift every asteroid one tick by its constant velocity, wrapping at edges.
export const stepAsteroids = <T extends Pick<State, "asteroids" | "bounds">>(
  state: T,
  dt: number,
): T => {
  const asteroids = state.asteroids.map((a) => ({
    ...a,
    position: Motion.wrap(Motion.advance(a.position, a.velocity, dt), state.bounds),
  }));
  return { ...state, asteroids };
};
