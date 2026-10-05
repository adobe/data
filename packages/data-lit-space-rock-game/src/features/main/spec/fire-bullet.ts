// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Bullet } from "../data/values/bullet/bullet.js";

// Fire one bullet from the ship's nose, inheriting its momentum, under a fresh
// entity id (the map key).
export const fireBullet = (
  state: Pick<State, "ship" | "entities">,
): Pick<State, "entities"> => {
  const id = Math.max(0, ...state.entities.keys()) + 1;
  return { entities: new Map(state.entities).set(id, Bullet.fire(state.ship)) };
};
