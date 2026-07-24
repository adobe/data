// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";
import { startPosition } from "./start-position.js";

// Spend one life: respawn the frog at the start, or end the game if that was the
// last life. A no-op once the game has finished, keeping it idempotent.
export const loseLife = <T extends Pick<State, "lives" | "status" | "frog" | "width">>(
  state: T,
): T => {
  if (!GameStatus.isPlaying(state.status)) return state;
  const lives = state.lives - 1;
  return lives <= 0
    ? { ...state, lives: 0, status: "gameOver" }
    : { ...state, lives, frog: startPosition(state) };
};
