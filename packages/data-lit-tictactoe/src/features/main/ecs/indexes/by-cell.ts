// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// O(1) lookup of the mark occupying a cell. Unique: a cell holds at most one mark,
// so `db.indexes.byCell.get({ cellIndex }) → Entity | null`.
export const byCell = {
  key: "cellIndex",
  unique: true,
} as const satisfies CoreDatabase.Index;
