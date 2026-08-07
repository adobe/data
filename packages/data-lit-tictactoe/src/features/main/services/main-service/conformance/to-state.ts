// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import { BoardState } from "../../../data/board-state/board-state.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { toData } from "./to-data.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. Each
// placed-mark entity is read through the per-entity `toData` projection, folded
// into the compact board string, then joined with the scalar resources.
// Test-only.
const readBoard = (store: CoreDatabase.Store): BoardState =>
  BoardState.fromMarks(
    [...store.select(store.archetypes.PlacedMark.components)].map((entity) => toData(store, entity)),
  );

export const toState = (store: CoreDatabase.Store): State => ({
  board: readBoard(store),
  firstPlayer: store.resources.firstPlayer,
  xWins: store.resources.xWins,
  oWins: store.resources.oWins,
  draws: store.resources.draws,
});
