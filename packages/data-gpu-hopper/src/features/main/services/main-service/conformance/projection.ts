// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { Frog } from "../../../data/frog/frog.js";
import type { Hazard } from "../../../data/hazard/hazard.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read the single frog entity through the Frog archetype's full component set
// (`x`, `y`) — hazards lack `y`, so the shapes never alias.
const readFrog = (store: CoreDatabase.Store): Frog => {
  for (const arch of store.queryArchetypes(store.archetypes.Frog.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      return { x: arch.columns.x.get(row), y: arch.columns.y.get(row) };
    }
  }
  throw new Error("frog entity missing from store");
};

// Read every hazard entity back into the identity-keyed `entities` map. The key is
// the allocated ecs entity id (the runner leaves it open via `Match.ref`); the
// value is id-less.
const readEntities = (store: CoreDatabase.Store): Map<number, Hazard> => {
  const entities = new Map<number, Hazard>();
  for (const arch of store.queryArchetypes(store.archetypes.Hazard.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      entities.set(arch.columns.id.get(row), {
        kind: arch.columns.kind.get(row),
        lane: arch.columns.lane.get(row),
        x: arch.columns.x.get(row),
        width: arch.columns.width.get(row),
        velocity: arch.columns.velocity.get(row),
      });
    }
  }
  return entities;
};

// The test-only ecs↔`State` projection, passed to `Conformance.runFeature` (and
// reused by the system tick-loop / outcome-selection tests). Hopper is not
// id-addressed (transactions take a direction, not an entity id), so `fromState`
// returns no id map and there are no id-list computeds — hence no `toData`. These
// are STRICTLY for conformance tests and MUST NEVER run in production code.
export const projection = {
  // Seed a store to exactly match a `data/` `State`: clear the frog and every
  // hazard, set the scalar resources and terrain, then insert one frog entity and
  // one entity per hazard. The inverse of `toState`. Clearing iterates tail→head
  // so each delete is from the tail (no hole-fill shift). The loop-plumbing
  // resources (frameDelta / pendingDirection) have no `State` analogue and keep
  // their defaults.
  fromState: (store: CoreDatabase.Store, state: State): void => {
    for (const arch of store.queryArchetypes(store.archetypes.Frog.components)) {
      for (let row = arch.rowCount - 1; row >= 0; row--) store.delete(arch.columns.id.get(row));
    }
    for (const arch of store.queryArchetypes(store.archetypes.Hazard.components)) {
      for (let row = arch.rowCount - 1; row >= 0; row--) store.delete(arch.columns.id.get(row));
    }

    store.resources.width = state.width;
    store.resources.height = state.height;
    store.resources.lives = state.lives;
    store.resources.score = state.score;
    store.resources.status = state.status;
    store.resources.lanes = state.lanes;

    store.archetypes.Frog.insert({ x: state.frog.x, y: state.frog.y });
    for (const hazard of state.entities.values()) {
      store.archetypes.Hazard.insert(hazard);
    }
  },
  // Read a store back into a `data/` `State` — the inverse of `fromState`. The
  // scalar resources join the singleton frog and the identity-keyed hazard entities.
  toState: (store: CoreDatabase.Store): State => ({
    width: store.resources.width,
    height: store.resources.height,
    lanes: store.resources.lanes,
    entities: readEntities(store),
    frog: readFrog(store),
    lives: store.resources.lives,
    score: store.resources.score,
    status: store.resources.status,
  }),
};
