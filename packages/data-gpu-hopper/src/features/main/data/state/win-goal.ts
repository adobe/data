// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Score the reached goal and end the game as won. A no-op once the game has
// finished. Writes only `score` + `status`.
export const winGoal = (
  state: Pick<State, "score" | "status">,
): Pick<State, "score" | "status"> => {
  if (!GameStatus.isPlaying(state.status)) return { score: state.score, status: state.status };
  return { score: state.score + 1, status: "won" };
};

// winGoal reads only score / status; the rest is inert here.
const base: Omit<State, "score" | "status"> = {
  width: 5,
  height: 3,
  lanes: [],
  hazards: new Set(),
  lives: 3,
  frog: { x: 2, y: 2 },
};

// Spec-owned cases, shared with the ecs `winGoal` transaction.
export const cases: Conformance<typeof winGoal> = [
  { name: "scores the goal and wins",
    before: { ...base, score: 2, status: "playing" }, after: { score: 3, status: "won" } },
  { name: "ignores a finished game (no-op)",
    before: { ...base, score: 3, status: "won" }, after: { score: 3, status: "won" } },
];
