// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../spec/state.js";
import type { Hazard } from "../../data/entities/hazard.js";
import type { CoreDatabase } from "../core/core-database.js";

// Every hazard entity, keyed by its ecs entity id (compared up to an id-bijection).
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

// The test-only ecs↔`State` projection. `fromState` clears every hazard (tail→head),
// sets the resources, and inserts one entity per hazard; `frameDelta` has no `State`
// analogue and keeps its value. Hopper ops take no entity ids, so no id map and no
// `toData`.
export const projection = {
  fromState: (store: CoreDatabase.Store, state: State): void => {
    for (const arch of store.queryArchetypes(store.archetypes.Hazard.components)) {
      for (let row = arch.rowCount - 1; row >= 0; row--) store.delete(arch.columns.id.get(row));
    }
    store.resources.width = state.width;
    store.resources.height = state.height;
    store.resources.lanes = state.lanes;
    store.resources.frog = state.frog;
    store.resources.lives = state.lives;
    store.resources.score = state.score;
    store.resources.status = state.status;
    for (const hazard of state.entities.values()) {
      store.archetypes.Hazard.insert({ nonPersistent: true, nonShared: true, ...hazard });
    }
  },
  toState: (store: CoreDatabase.Store): State => ({
    width: store.resources.width,
    height: store.resources.height,
    lanes: store.resources.lanes,
    entities: readEntities(store),
    frog: store.resources.frog,
    lives: store.resources.lives,
    score: store.resources.score,
    status: store.resources.status,
  }),
};
