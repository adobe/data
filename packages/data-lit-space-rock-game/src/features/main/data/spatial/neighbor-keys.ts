// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import { cellKey } from "./cell-key.js";

// The 3×3 block of cell ids centred on `position` — this cell plus its eight
// neighbours. A broad-phase query unions `db.index.byCell.find` over these keys
// to gather every entity that could overlap. Offsetting the position by whole
// cell widths lands exactly one cell over (floor((x ± cellSize) / cellSize) =
// floor(x / cellSize) ± 1), so this reuses `cellKey` rather than repeating the
// pack. Correct only when `cellSize` ≥ the largest entity diameter.
export const neighborKeys = (position: Vec2, cellSize: number): number[] => {
  const keys: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      keys.push(
        cellKey([position[0] + dx * cellSize, position[1] + dy * cellSize], cellSize),
      );
    }
  }
  return keys;
};
