// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Bullet } from "../bullet/bullet.js";
import { Ship } from "../ship/ship.js";

// Fire one bullet from the ship's nose, inheriting its momentum. Composes the
// ship's muzzle kinematics with the bullet's own speed constant.
export const fireBullet = <T extends Pick<State, "ship" | "bullets">>(state: T): T => {
  const { position, velocity } = Ship.muzzle(state.ship, Bullet.speed);
  const bullet: Bullet = { position, velocity, age: 0 };
  return { ...state, bullets: [...state.bullets, bullet] };
};
