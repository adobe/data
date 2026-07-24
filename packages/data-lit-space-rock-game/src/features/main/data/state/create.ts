// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Ship } from "../ship/ship.js";

// A blank neutral `State`: no play-field, a centred-at-origin idle ship, no
// bullets or asteroids, full lives, zero score, wave 0. Unlike `createInitial`
// it spawns no wave — it is the base every transform test builds a `before`
// from (`{ ...State.create(), …overrides }`), so each case names only the
// fields it exercises.
export const create = (): State => ({
  bounds: [0, 0],
  ship: Ship.spawn([0, 0]),
  bullets: [],
  asteroids: [],
  score: 0,
  lives: 3,
  wave: 0,
});
