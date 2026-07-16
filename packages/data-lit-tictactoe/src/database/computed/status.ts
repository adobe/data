// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../../types/board-state/board-state.js";
import type { IndexDatabase } from "../index-database.js";

export const status = cached((db: IndexDatabase) =>
  Observe.withFilter(db.observe.resources.board, BoardState.deriveStatus),
);
