// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../../../data/board-state/board-state.js";
import type { IndexDatabase } from "../../index-database/index-database.js";
import { board } from "./board.js";

export const isGameOver = cached((db: IndexDatabase) =>
  Observe.withFilter(board(db), BoardState.isGameOver),
);
