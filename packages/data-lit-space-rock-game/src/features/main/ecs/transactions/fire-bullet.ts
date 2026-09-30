// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Bullet } from "../../data/values/bullet/bullet.js";
import type { CoreDatabase } from "../core/core-database.js";

// Fire one bullet from the ship's muzzle.
export const fireBullet = (t: CoreDatabase.Store): void => {
  t.archetypes.Bullet.insert(Bullet.fire(t.resources.ship));
};
