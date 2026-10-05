// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { create } from "./create.js";

const at = (x: number, y: number): Vec2 => [x, y] as Vec2;

/** Representative presence states the conformance projection round-trips. */
export const samples: readonly State[] = [
  create(), // no cursors reported yet
  { cursors: { X: at(0.5, 0.25) } }, // one peer cursor
  { cursors: { X: at(0.5, 0.25), O: at(0.75, 0.5) } }, // both peer cursors
];
