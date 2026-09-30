// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Frog } from "../data/values/frog/frog.js";
import { GameStatus } from "../data/values/game-status/game-status.js";
import type { State } from "./state.js";

// Spend one life: respawn the frog at the start, or end the game on the last life. A
// no-op once the game has finished. A `collision` sub-transition, not an operation of
// its own.
export const loseLife = (
  state: Pick<State, "lives" | "status" | "frog" | "width">,
): Pick<State, "lives" | "status" | "frog"> => {
  if (!GameStatus.isPlaying(state.status))
    return { lives: state.lives, status: state.status, frog: state.frog };
  const lives = state.lives - 1;
  return lives <= 0
    ? { lives: 0, status: "gameOver", frog: state.frog }
    : { lives, status: state.status, frog: Frog.start(state.width) };
};
