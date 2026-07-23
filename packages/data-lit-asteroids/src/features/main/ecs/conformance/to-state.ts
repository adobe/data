// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { Ship } from "../../data/ship/ship.js";
import type { Bullet } from "../../data/bullet/bullet.js";
import type { Asteroid } from "../../data/asteroid/asteroid.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. Each
// kind is read through its named archetype's full component set (not an
// incidental single column), so the three entity shapes never alias. Test-only.
const readShip = (store: CoreDatabase.Store): Ship => {
  const [entity] = store.select(store.archetypes.Ship.components);
  if (entity === undefined) throw new Error("conformance projection: expected a ship entity");
  const row = store.read(entity, store.archetypes.Ship);
  if (row === null) throw new Error("conformance projection: expected a ship entity");
  return { position: row.position, velocity: row.velocity, rotation: row.rotation };
};

const readBullets = (store: CoreDatabase.Store): Bullet[] => {
  const bullets: Bullet[] = [];
  for (const arch of store.queryArchetypes(store.archetypes.Bullet.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      bullets.push({
        position: arch.columns.position.get(row),
        velocity: arch.columns.velocity.get(row),
        age: arch.columns.age.get(row),
      });
    }
  }
  return bullets;
};

const readAsteroids = (store: CoreDatabase.Store): Asteroid[] => {
  const asteroids: Asteroid[] = [];
  for (const arch of store.queryArchetypes(store.archetypes.Asteroid.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      asteroids.push({
        position: arch.columns.position.get(row),
        velocity: arch.columns.velocity.get(row),
        size: arch.columns.size.get(row),
      });
    }
  }
  return asteroids;
};

export const toState = (store: CoreDatabase.Store): State => ({
  bounds: store.resources.bounds,
  ship: readShip(store),
  bullets: readBullets(store),
  asteroids: readAsteroids(store),
  score: store.resources.score,
  lives: store.resources.lives,
  wave: store.resources.wave,
});
