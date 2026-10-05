// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Ship } from "../data/values/ship/ship.js";
import { Lives } from "../data/values/lives/lives.js";

// A blank neutral `State`: no play-field, an idle ship at the origin, no entities,
// full lives, zero score, wave 0. Cases author their `before` as deltas over it.
export const create = (): State => ({
  bounds: [0, 0],
  ship: Ship.spawn([0, 0]),
  entities: new Map(),
  score: 0,
  lives: Lives.initial,
  wave: 0,
});
