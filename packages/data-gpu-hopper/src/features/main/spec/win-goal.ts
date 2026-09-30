// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../data/values/game-status/game-status.js";
import type { State } from "./state.js";

// Score the reached goal and end the game as won. A no-op once the game has finished.
// A `collision` sub-transition, not an operation of its own.
export const winGoal = (state: Pick<State, "score" | "status">): Pick<State, "score" | "status"> =>
  GameStatus.isPlaying(state.status)
    ? { score: state.score + 1, status: "won" }
    : { score: state.score, status: state.status };
