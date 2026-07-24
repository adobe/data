// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// winGoal reads only score / status; the rest is inert here.
const base: Omit<State, "score" | "status"> = {
  width: 5,
  height: 3,
  lanes: [],
  hazards: [],
  lives: 3,
  frog: { x: 2, y: 2 },
};

// Spec-owned `{ before, args, after }` cases for `State.winGoal`, shared with the
// ecs `winGoal` transaction: scoring the goal, and the finished-game no-op.
export const cases: readonly ConformanceCase<void>[] = [
  {
    name: "scores the goal and wins",
    before: { ...base, score: 2, status: "playing" },
    args: undefined,
    after: { ...base, score: 3, status: "won" },
  },
  {
    name: "ignores a finished game (no-op)",
    before: { ...base, score: 3, status: "won" },
    args: undefined,
    after: { ...base, score: 3, status: "won" },
  },
];
