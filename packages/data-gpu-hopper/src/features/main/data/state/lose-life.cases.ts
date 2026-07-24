// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// A 5-wide board, so the respawn column is `floor((5-1)/2) = 2`. loseLife reads
// only lives / status / frog / width; the rest is inert here.
const base: Omit<State, "lives" | "status" | "frog"> = {
  width: 5,
  height: 3,
  lanes: [],
  hazards: [],
  score: 0,
};

// Spec-owned `{ before, args, after }` cases for `State.loseLife`, shared with the
// ecs `loseLife` transaction: a life lost + respawn, the last life ending the
// game (no respawn), and the finished-game no-op.
export const cases: readonly ConformanceCase<void>[] = [
  {
    name: "spends a life and respawns the frog at the start",
    before: { ...base, lives: 3, status: "playing", frog: { x: 1, y: 1 } },
    args: undefined,
    after: { ...base, lives: 2, status: "playing", frog: { x: 2, y: 0 } },
  },
  {
    name: "the last life ends the game without respawning",
    before: { ...base, lives: 1, status: "playing", frog: { x: 3, y: 2 } },
    args: undefined,
    after: { ...base, lives: 0, status: "gameOver", frog: { x: 3, y: 2 } },
  },
  {
    name: "ignores a finished game (no-op)",
    before: { ...base, lives: 0, status: "gameOver", frog: { x: 3, y: 2 } },
    args: undefined,
    after: { ...base, lives: 0, status: "gameOver", frog: { x: 3, y: 2 } },
  },
];
