// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Bullet } from "../bullet/bullet.js";
import { Motion } from "../motion/motion.js";

// Advance every bullet one tick: drop the ones that expire this tick, and move
// + age + wrap the survivors.
export const stepBullets = <T extends Pick<State, "bullets" | "bounds">>(
  state: T,
  dt: number,
): T => {
  const bullets = state.bullets
    .filter((b) => !Bullet.isExpired(b.age, dt))
    .map((b) => ({
      ...b,
      position: Motion.wrap(Motion.advance(b.position, b.velocity, dt), state.bounds),
      age: b.age + dt,
    }));
  return { ...state, bullets };
};
