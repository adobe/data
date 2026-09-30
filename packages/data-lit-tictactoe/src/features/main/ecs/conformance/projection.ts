// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../spec/state.js";
import type { PlacedMark } from "../../data/entities/placed-mark.js";
import type { CoreDatabase } from "../core/core-database.js";

// Read one placed-mark entity back into its id-less value.
const toData = (store: CoreDatabase.Store, entity: Entity): PlacedMark => {
  const row = store.read(entity, store.archetypes.PlacedMark);
  if (row === null) throw new Error("conformance projection: expected a placed-mark entity");
  return { mark: row.mark, cellIndex: row.cellIndex };
};

// The ecs↔`State` projection. `fromState` clears every mark (tail first, so no delete
// shifts a row still to visit), sets the resources, and inserts each mark, returning
// the `spec id → entity` map; `toState` reads it back, keyed by entity.
export const projection = {
  fromState: (store: CoreDatabase.Store, state: State): ReadonlyMap<number, Entity> => {
    for (const arch of store.queryArchetypes(store.archetypes.PlacedMark.components)) {
      for (let row = arch.rowCount - 1; row >= 0; row--) store.delete(arch.columns.id.get(row));
    }
    store.resources.firstPlayer = state.firstPlayer;
    store.resources.xWins = state.xWins;
    store.resources.oWins = state.oWins;
    store.resources.draws = state.draws;
    return new Map(
      [...state.marks].map(([specId, mark]) => [specId, store.archetypes.PlacedMark.insert(mark)]),
    );
  },
  toState: (store: CoreDatabase.Store): State => ({
    marks: new Map(
      store
        .select(store.archetypes.PlacedMark.components)
        .map((entity) => [entity, toData(store, entity)]),
    ),
    firstPlayer: store.resources.firstPlayer,
    xWins: store.resources.xWins,
    oWins: store.resources.oWins,
    draws: store.resources.draws,
  }),
  toData,
};
