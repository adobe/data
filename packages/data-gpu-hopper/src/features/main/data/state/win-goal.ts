// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";

// Score the reached goal and end the game as won. A no-op once the game has
// finished, keeping it idempotent.
export const winGoal = <T extends Pick<State, "score" | "status">>(state: T): T => {
  if (!GameStatus.isPlaying(state.status)) return state;
  return { ...state, score: state.score + 1, status: "won" };
};
