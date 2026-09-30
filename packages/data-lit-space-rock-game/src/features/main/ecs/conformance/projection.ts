// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../spec/state.js";
import { Bullet } from "../../data/values/bullet/bullet.js";
import type { Asteroid } from "../../data/values/asteroid/asteroid.js";
import type { CoreDatabase } from "../core/core-database.js";

// Read one entity back into its `data/` value: a bullet or an asteroid, probed by
// archetype (only bullets carry `age`, only asteroids `size`).
const toData = (store: CoreDatabase.Store, entity: Entity): Bullet | Asteroid => {
  const bullet = store.read(entity, store.archetypes.Bullet);
  if (bullet !== null) return { position: bullet.position, velocity: bullet.velocity, age: bullet.age };
  const asteroid = store.read(entity, store.archetypes.Asteroid);
  if (asteroid !== null) return { position: asteroid.position, velocity: asteroid.velocity, size: asteroid.size };
  throw new Error("conformance projection: entity is not a bullet or asteroid");
};

// The test-only ecs↔`State` projection. `fromState` clears every entity (tail→head,
// so each delete is from the tail), sets the resources, and inserts each entity into
// its archetype by its structural guard, returning the `spec id → entity` map.
// `toState` reads it back keyed by entity (the map compares up to an id-bijection).
export const projection = {
  fromState: (store: CoreDatabase.Store, state: State): ReadonlyMap<number, Entity> => {
    for (const arch of store.queryArchetypes(["position"])) {
      for (let row = arch.rowCount - 1; row >= 0; row--) {
        store.delete(arch.columns.id.get(row));
      }
    }
    store.resources.bounds = state.bounds;
    store.resources.ship = state.ship;
    store.resources.score = state.score;
    store.resources.lives = state.lives;
    store.resources.wave = state.wave;
    return new Map(
      [...state.entities].map(([specId, value]) => [
        specId,
        Bullet.is(value) ? store.archetypes.Bullet.insert(value) : store.archetypes.Asteroid.insert(value),
      ]),
    );
  },
  toState: (store: CoreDatabase.Store): State => {
    const entities = new Map<number, Bullet | Asteroid>();
    for (const arch of store.queryArchetypes(["position"])) {
      for (let row = 0; row < arch.rowCount; row++) {
        const entity = arch.columns.id.get(row);
        entities.set(entity, toData(store, entity));
      }
    }
    return {
      bounds: store.resources.bounds,
      ship: store.resources.ship,
      entities,
      score: store.resources.score,
      lives: store.resources.lives,
      wave: store.resources.wave,
    };
  },
  toData,
};
