// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";
import { startPosition } from "./start-position.js";

// Spend one life: respawn the frog at the start, or end the game if that was the
// last life. A no-op once the game has finished. Writes only `lives` + `status`
// + `frog` (each branch supplies all three; some are unchanged).
export const loseLife = (
  state: Pick<State, "lives" | "status" | "frog" | "width">,
): Pick<State, "lives" | "status" | "frog"> => {
  if (!GameStatus.isPlaying(state.status))
    return { lives: state.lives, status: state.status, frog: state.frog };
  const lives = state.lives - 1;
  return lives <= 0
    ? { lives: 0, status: "gameOver", frog: state.frog }
    : { lives, status: state.status, frog: startPosition(state) };
};
