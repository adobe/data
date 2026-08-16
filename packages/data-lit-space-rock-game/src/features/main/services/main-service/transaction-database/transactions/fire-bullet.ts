// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import { Bullet } from "../../../../data/bullet/bullet.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { readShip } from "./read-ship.js";

// Fire one bullet from the ship's muzzle. Thin wrapper over State.fireBullet:
// project the ship, let the data/ transform compute the bullet's spawn
// kinematics (nose position + inherited momentum), and insert it with its
// initial spatial cell. No ship yet (before newGame) → nothing to fire.
export const fireBullet = (t: CoreDatabase.Store): void => {
  const found = readShip(t);
  if (found === undefined) return;
  const { entities } = State.fireBullet({ ship: found.ship, entities: new Map() });
  // The seed's entities were empty, so the patch holds exactly the fired bullet.
  for (const value of entities.values()) {
    if (Bullet.is(value)) t.archetypes.Bullet.insert(value);
  }
};
