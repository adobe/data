// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../../core-database/core-database.js";

// O(1) lookup of the mark occupying a given cell. Unique: a cell holds at most
// one mark, so `db.indexes.byCell.get({ index }) → Entity | null`.
export const byCell = {
  key: "index",
  unique: true,
} as const satisfies CoreDatabase.Index;
