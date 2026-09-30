// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import { Ship } from "../../data/values/ship/ship.js";
import type { CoreDatabase } from "../core/core-database.js";

// An asteroid struck the ship (dispatched by the collision system): spend a life
// (floored at zero) and respawn the ship at the centre. Bullets stay in play.
export const loseLife = (t: CoreDatabase.Store): void => {
  t.resources.lives = Math.max(0, t.resources.lives - 1);
  t.resources.ship = Ship.spawn(Vec2.scale(t.resources.bounds, 0.5));
};
