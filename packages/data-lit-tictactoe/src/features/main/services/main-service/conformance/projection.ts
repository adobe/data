// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { BoardState } from "../../../data/board-state/board-state.js";
import { PlayerMark } from "../../../data/player-mark/player-mark.js";
import type { PlacedMark } from "../../../data/placed-mark/placed-mark.js";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one placed-mark entity back into its `data/` value — the per-entity mapping
// `toState` folds over.
const toData = (store: CoreDatabase.Store, entity: Entity): PlacedMark => {
  const row = store.read(entity, store.archetypes.PlacedMark);
  if (row === null)
    throw new Error("conformance projection: expected a placed-mark entity");
  return { mark: row.mark, index: row.index };
};

// The test-only ecs↔`State` projection, passed to `Conformance.runFeature`.
// `fromState` seeds a store to a `State` (tictactoe is index-addressed, so it
// returns no id map); `toState` reads it back; `toData` reads one entity.
export const projection = {
  fromState: (store: CoreDatabase.Store, state: State): void => {
    for (const arch of store.queryArchetypes(
      store.archetypes.PlacedMark.components,
    )) {
      for (let row = arch.rowCount - 1; row >= 0; row--)
        store.delete(arch.columns.id.get(row));
    }
    store.resources.firstPlayer = state.firstPlayer;
    store.resources.xWins = state.xWins;
    store.resources.oWins = state.oWins;
    store.resources.draws = state.draws;
    for (let index = 0; index < state.board.length; index++) {
      const cell = state.board[index];
      if (PlayerMark.is(cell))
        store.archetypes.PlacedMark.insert({ mark: cell, index });
    }
  },
  toState: (store: CoreDatabase.Store): State => ({
    board: BoardState.fromMarks(
      [...store.select(store.archetypes.PlacedMark.components)].map((entity) =>
        toData(store, entity),
      ),
    ),
    firstPlayer: store.resources.firstPlayer,
    xWins: store.resources.xWins,
    oWins: store.resources.oWins,
    draws: store.resources.draws,
  }),
  toData,
};
