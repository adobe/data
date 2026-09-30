// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Frog } from "./frog.js";

// Whether the frog's column is still on a board `width` columns wide. A log can carry
// it past either edge.
export const onBoard = (frog: Frog, width: number): boolean => frog.x >= 0 && frog.x <= width - 1;
