// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { readShip } from "./read-ship.js";

// Fire one bullet from the ship's muzzle. Thin wrapper over State.fireBullet:
// project the ship, let the data/ transform compute the bullet's spawn
// kinematics (nose position + inherited momentum), and insert it with its
// initial spatial cell. No ship yet (before newGame) → nothing to fire.
export const fireBullet = (t: CoreDatabase.Store): void => {
  const found = readShip(t);
  if (found === undefined) return;
  // Typed seed so the empty bullets set widens to `Set<Bullet>`, not `Set<never>`.
  const seed: Pick<State, "ship" | "bullets"> = {
    ship: found.ship,
    bullets: new Set(),
  };
  const { bullets } = State.fireBullet(seed);
  const [bullet] = bullets;
  t.archetypes.Bullet.insert(bullet);
};
