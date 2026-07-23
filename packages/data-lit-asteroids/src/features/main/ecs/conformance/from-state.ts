// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`: clear every entity, set the
// scalar resources, then insert the ship, bullets, and asteroids. The inverse
// of `toState`. Test-only — the bridge that lets an ecs mutation be checked
// against the pure transform it stands for (see `expect-conforms.ts`).
//
// Clearing iterates tail→head so each delete is from the tail (no hole-fill
// shift). Every entity carries `position`, so one query covers all three
// archetypes. Row shapes equal their `data/` types (no stored broad-phase
// column), so each value inserts directly.
export const fromState = (store: CoreDatabase.Store, state: State): void => {
  for (const arch of store.queryArchetypes(["position"])) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      store.delete(arch.columns.id.get(row));
    }
  }
  store.resources.bounds = state.bounds;
  store.resources.score = state.score;
  store.resources.lives = state.lives;
  store.resources.wave = state.wave;
  store.archetypes.Ship.insert(state.ship);
  for (const bullet of state.bullets) {
    store.archetypes.Bullet.insert(bullet);
  }
  for (const asteroid of state.asteroids) {
    store.archetypes.Asteroid.insert(asteroid);
  }
};
