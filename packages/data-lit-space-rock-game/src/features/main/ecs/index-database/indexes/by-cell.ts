// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Spatial } from "../../../data/spatial/spatial.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Broad-phase spatial index: cell id → the entities currently in that cell.
// A COMPUTED-KEY index — the `cell` slot is derived from each entity's
// `position` on the fly (`Spatial.cellKey`), so it stays correct with zero
// maintenance: there is no stored `cell` column to keep in sync at every
// insert/update, and nothing can silently drift. Coverage is by columns, so
// every archetype carrying `position` (Ship, Asteroid, Bullet) is indexed.
// Multi-value (not unique) — many entities share a cell. The collision system
// unions `find({ cell })` over `Spatial.neighborKeys(...)` to gather overlap
// candidates.
export const byCell = {
  components: ["position"],
  key: { cell: (c) => Spatial.cellKey(c.position!, Spatial.cellSize) },
} as const satisfies CoreDatabase.Index;
