// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`: clear the frog and every
// hazard, set the scalar resources and terrain, then insert one frog entity and
// one entity per hazard. The inverse of `toState`. Test-only — the bridge that
// lets an ecs mutation be checked against the pure transform it stands for (see
// `expect-conforms.ts`). Clearing iterates tail→head so each delete is from the
// tail (no hole-fill shift).
export const fromState = (store: CoreDatabase.Store, state: State): void => {
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
  for (const hazard of state.hazards) {
    store.archetypes.Hazard.insert(hazard);
  }
};
