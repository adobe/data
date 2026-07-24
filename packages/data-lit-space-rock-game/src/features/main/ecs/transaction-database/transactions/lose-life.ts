// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import { Ship } from "../../../data/ship/ship.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { readShip } from "./read-ship.js";

// Spend a life and respawn the ship at centre — the discrete outcome the
// collision system dispatches when an asteroid strikes the ship. Reproduces the
// struck branch of State.resolveShipHits (lives floored at zero, ship recentred
// via Ship.spawn); bullets stay in play, as the spec leaves them. No ship yet
// (before newGame) → nothing to do.
export const loseLife = (t: CoreDatabase.Store): void => {
  const found = readShip(t);
  if (found === undefined) return;
  t.resources.lives = Math.max(0, t.resources.lives - 1);
  const respawned = Ship.spawn(Vec2.scale(t.resources.bounds, 0.5));
  t.update(found.entity, respawned);
};
