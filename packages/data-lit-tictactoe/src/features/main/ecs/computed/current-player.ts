// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../../data/values/board-state/board-state.js";
import type { IndexDatabase } from "../indexes/index-database.js";
import { board } from "./board.js";

// Observes `firstPlayer` too: restarting an empty board flips it without touching a mark.
export const currentPlayer = cached((db: IndexDatabase) =>
  Observe.withMap(
    Observe.fromProperties({ board: board(db), firstPlayer: db.observe.resources.firstPlayer }),
    ({ board, firstPlayer }) => BoardState.currentPlayer(board, firstPlayer),
  ),
);
