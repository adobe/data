// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { PlayerMark } from "data-lit-tictactoe";
import type { Cursors } from "./cursors.js";

/** Return a copy of `cursors` with `mark`'s position set to `[x, y]`. */
export const set = (cursors: Cursors, mark: PlayerMark, x: number, y: number): Cursors => ({
  ...cursors,
  [mark]: [x, y] as Vec2,
});
