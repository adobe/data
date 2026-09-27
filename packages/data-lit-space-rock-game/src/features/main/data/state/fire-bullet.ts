// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Bullet } from "../bullet/bullet.js";
import { Ship } from "../ship/ship.js";

// Fire one bullet from the ship's nose, inheriting its momentum. Composes the
// ship's muzzle kinematics with the bullet's own speed constant, minting a fresh
// entity id (the map key) for it — the bullet value itself carries no id.
export const fireBullet = (
  state: Pick<State, "ship" | "entities">,
): Pick<State, "entities"> => {
  const { position, velocity } = Ship.muzzle(state.ship, Bullet.speed);
  const bullet: Bullet = { position, velocity, age: 0 };
  const id = Math.max(0, ...state.entities.keys()) + 1;
  return { entities: new Map(state.entities).set(id, bullet) };
};
