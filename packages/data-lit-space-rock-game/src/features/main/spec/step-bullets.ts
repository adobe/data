// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Bullet } from "../data/values/bullet/bullet.js";
import { Motion } from "../data/values/motion/motion.js";

// Advance every bullet one tick: drop the ones that expire this tick, and move
// + age + wrap the survivors (keeping each survivor's entity id). Non-bullet
// entities pass through untouched.
export const stepBullets = (
  state: Pick<State, "entities" | "bounds">,
  { dt }: { readonly dt: number },
): Pick<State, "entities"> => {
  const entities = new Map(state.entities);
  for (const [id, value] of state.entities) {
    if (!Bullet.is(value)) continue;
    if (Bullet.isExpired(value.age, dt)) {
      entities.delete(id);
      continue;
    }
    entities.set(id, {
      ...value,
      position: Motion.wrap(
        Motion.advance(value.position, value.velocity, dt),
        state.bounds,
      ),
      age: value.age + dt,
    });
  }
  return { entities };
};
