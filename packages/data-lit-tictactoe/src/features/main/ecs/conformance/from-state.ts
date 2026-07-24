// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import { PlayerMark } from "../../data/player-mark/player-mark.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`: clear every placed mark, set
// the scalar resources, then insert one PlacedMark entity per occupied board
// cell. The inverse of `toState`. Test-only — the bridge that lets an ecs
// mutation be checked against the pure transform it stands for (see
// `expect-conforms.ts`).
//
// Clearing iterates tail→head so each delete is from the tail (no hole-fill
// shift). The board string carries the marks (tictactoe stores each mark as an
// entity), so `PlayerMark.is` narrows each cell and skips the blanks.
export const fromState = (store: CoreDatabase.Store, state: State): void => {
  for (const arch of store.queryArchetypes(store.archetypes.PlacedMark.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      store.delete(arch.columns.id.get(row));
    }
  }
  store.resources.firstPlayer = state.firstPlayer;
  store.resources.xWins = state.xWins;
  store.resources.oWins = state.oWins;
  store.resources.draws = state.draws;
  for (let index = 0; index < state.board.length; index++) {
    const cell = state.board[index];
    if (PlayerMark.is(cell)) {
      store.archetypes.PlacedMark.insert({ mark: cell, index });
    }
  }
};
