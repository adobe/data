// © 2026 Adobe. MIT License. See /LICENSE for details.
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";
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

// A 5-wide board, so the respawn column is `floor((5-1)/2) = 2`. loseLife reads
// only lives / status / frog / width; the rest is inert here.
const base: Omit<State, "lives" | "status" | "frog"> = {
  width: 5,
  height: 3,
  lanes: [],
  entities: new Map(),
  score: 0,
};

// Spec-owned cases, shared with the ecs `loseLife` transaction.
export const cases = /*@__PURE__*/ Conformance.cases(loseLife,
  { name: "spends a life and respawns the frog at the start",
    before: { ...base, lives: 3, status: "playing", frog: { x: 1, y: 1 } },
    after: { lives: 2, status: "playing", frog: { x: 2, y: 0 } } },
  { name: "the last life ends the game without respawning",
    before: { ...base, lives: 1, status: "playing", frog: { x: 3, y: 2 } },
    after: { lives: 0, status: "gameOver", frog: { x: 3, y: 2 } } },
  { name: "ignores a finished game (no-op)",
    before: { ...base, lives: 0, status: "gameOver", frog: { x: 3, y: 2 } },
    after: { lives: 0, status: "gameOver", frog: { x: 3, y: 2 } } },
);
