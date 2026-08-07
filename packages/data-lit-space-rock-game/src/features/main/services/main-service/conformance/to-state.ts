// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { Ship } from "../../../data/ship/ship.js";
import type { Bullet } from "../../../data/bullet/bullet.js";
import type { Asteroid } from "../../../data/asteroid/asteroid.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { toData } from "./to-data.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`, built on
// the per-entity `toData` projection. Every entity carries `position`, so one
// query covers all three archetypes; each entity is projected through `toData` and
// sorted into the ship, bullets, or asteroids slot by its distinguishing member
// (`rotation` → ship, `age` → bullet, `size` → asteroid). Row order across
// archetypes is arbitrary, but the entity collections compare as multisets
// (`expectStateMatches`), so it need not be stable. Test-only.
export const toState = (store: CoreDatabase.Store): State => {
  let ship: Ship | undefined;
  const bullets: Bullet[] = [];
  const asteroids: Asteroid[] = [];
  for (const arch of store.queryArchetypes(["position"])) {
    for (let row = 0; row < arch.rowCount; row++) {
      const value = toData(store, arch.columns.id.get(row));
      if ("rotation" in value) ship = value;
      else if ("age" in value) bullets.push(value);
      else asteroids.push(value);
    }
  }
  if (ship === undefined) throw new Error("conformance projection: expected a ship entity");
  return {
    bounds: store.resources.bounds,
    ship,
    bullets,
    asteroids,
    score: store.resources.score,
    lives: store.resources.lives,
    wave: store.resources.wave,
  };
};
