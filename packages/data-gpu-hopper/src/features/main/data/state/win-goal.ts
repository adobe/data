// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";

// Score the reached goal and end the game as won. A no-op once the game has
// finished. Writes only `score` + `status`.
export const winGoal = (
  state: Pick<State, "score" | "status">,
): Pick<State, "score" | "status"> => {
  if (!GameStatus.isPlaying(state.status)) return { score: state.score, status: state.status };
  return { score: state.score + 1, status: "won" };
};
