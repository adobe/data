// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Level } from "../data/values/level/level.js";
import { Frog } from "../data/values/frog/frog.js";

// The initial game: `Level.initial`'s board with the frog at the start, nothing scored.
// Each hazard is keyed by its own spec-id.
export const create = (): State => {
  const { width, height, lanes, hazards, lives } = Level.initial;
  return {
    boardWidth: width,
    boardHeight: height,
    lanes,
    entities: new Map(hazards.map((hazard, index) => [index + 1, hazard])),
    frog: Frog.start(width),
    lives,
    score: 0,
    status: "playing",
  };
};
