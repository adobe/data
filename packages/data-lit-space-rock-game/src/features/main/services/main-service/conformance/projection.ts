// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { Ship } from "../../../data/ship/ship.js";
import { Bullet } from "../../../data/bullet/bullet.js";
import { Asteroid } from "../../../data/asteroid/asteroid.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its `data/` value — the per-entity projection
// `toState` is built on, and the single place the ecs↔data mapping for the three
// entity kinds lives. Unlike a single-archetype feature (todo), an entity here is
// one of Ship / Bullet / Asteroid, so `toData` probes each named archetype (their
// component sets are distinct — only Ship has `rotation`, only Bullet `age`, only
// Asteroid `size`) and projects the first that matches. Test-only.
const toData = (
  store: CoreDatabase.Store,
  entity: Entity,
): Ship | Bullet | Asteroid => {
  const ship = store.read(entity, store.archetypes.Ship);
  if (ship !== null)
    return {
      position: ship.position,
      velocity: ship.velocity,
      rotation: ship.rotation,
    };
  const bullet = store.read(entity, store.archetypes.Bullet);
  if (bullet !== null)
    return {
      position: bullet.position,
      velocity: bullet.velocity,
      age: bullet.age,
    };
  const asteroid = store.read(entity, store.archetypes.Asteroid);
  if (asteroid !== null)
    return {
      position: asteroid.position,
      velocity: asteroid.velocity,
      size: asteroid.size,
    };
  throw new Error(
    "conformance projection: entity is not a ship, bullet, or asteroid",
  );
};

// The test-only ecs↔`State` projection, passed to `Conformance.runFeature`.
// `fromState` seeds a store to a `State` (space-rock is not id-addressed, so it
// returns no id map); `toState` reads it back through `toData`; `toData` reads one
// entity. These are STRICTLY for conformance tests and MUST NEVER run in
// production code.
export const projection = {
  // Seed a store to exactly match a `data/` `State`: clear every entity, set the
  // scalar resources, then insert the ship and every `entities` value into its own
  // archetype by its structural guard. The inverse of `toState`. Clearing iterates
  // tail→head so each delete is from the tail (no hole-fill shift). Every entity
  // carries `position`, so one query covers all three archetypes. Row shapes equal
  // their `data/` types (no stored broad-phase column), so each value inserts
  // directly. Space-rock is not id-addressed (no case declares an `args` schema), so
  // `fromState` returns `void`.
  fromState: (store: CoreDatabase.Store, state: State): void => {
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
    for (const value of state.entities.values()) {
      if (Bullet.is(value)) store.archetypes.Bullet.insert(value);
      else store.archetypes.Asteroid.insert(value);
    }
  },
  // Read a store back into a `data/` `State` — the inverse of `fromState`, built on
  // the per-entity `toData` projection. Every entity carries `position`, so one
  // query covers all three archetypes; each entity is projected through `toData`.
  // The ship (its `rotation` distinguishes it) seeds the singleton `ship` field;
  // every bullet and asteroid goes into the ONE identity-keyed `entities` map under
  // a fresh key. Row/key order is arbitrary — the map compares order-independently.
  toState: (store: CoreDatabase.Store): State => {
    let ship: Ship | undefined;
    const entities = new Map<number, Bullet | Asteroid>();
    let nextKey = 1;
    for (const arch of store.queryArchetypes(["position"])) {
      for (let row = 0; row < arch.rowCount; row++) {
        const value = toData(store, arch.columns.id.get(row));
        if ("rotation" in value) ship = value;
        else entities.set(nextKey++, value);
      }
    }
    if (ship === undefined)
      throw new Error("conformance projection: expected a ship entity");
    return {
      bounds: store.resources.bounds,
      ship,
      entities,
      score: store.resources.score,
      lives: store.resources.lives,
      wave: store.resources.wave,
    };
  },
  toData,
};
