// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Lane } from "./lane.js";

// The lane occupying `row`, if any.
export const at = (lanes: readonly Lane[], row: number): Lane | undefined =>
  lanes.find((lane) => lane.row === row);
