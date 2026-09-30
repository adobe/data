// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Frog } from "./frog.js";

// Where the frog (re)spawns on a board `width` columns wide: centred on the bottom row.
export const start = (width: number): Frog => ({ x: Math.floor((width - 1) / 2), y: 0 });
