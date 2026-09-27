// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { loseLife } from "./lose-life.js";

// A 5-wide board, so the respawn column is `floor((5-1)/2) = 2`. loseLife reads
// only lives / status / frog / width; the rest is inert here.
const base: Omit<State, "lives" | "status" | "frog"> = {
  width: 5,
  height: 3,
  lanes: [],
  entities: new Map(),
  score: 0,
};

// Inert, spec-owned cases, shared with the ecs `loseLife` transaction. No args and
// no services.
export const cases: Conformance.SpecCases<State, typeof loseLife> = {
  cases: [
    { name: "spends a life and respawns the frog at the start",
      before: { ...base, lives: 3, status: "playing", frog: { x: 1, y: 1 } },
      after: { lives: 2, status: "playing", frog: { x: 2, y: 0 } } },
    { name: "the last life ends the game without respawning",
      before: { ...base, lives: 1, status: "playing", frog: { x: 3, y: 2 } },
      after: { lives: 0, status: "gameOver", frog: { x: 3, y: 2 } } },
    { name: "ignores a finished game (no-op)",
      before: { ...base, lives: 0, status: "gameOver", frog: { x: 3, y: 2 } },
      after: { lives: 0, status: "gameOver", frog: { x: 3, y: 2 } } },
  ],
};
