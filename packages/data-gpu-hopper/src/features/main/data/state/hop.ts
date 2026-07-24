// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Direction } from "../direction/direction.js";
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

// Snap the frog one cell in `direction`, re-aligning a log-ridden fractional `x`
// back onto the grid and clamping to the board. A no-op unless the game is in
// play, keeping it idempotent under repeated application.
export const hop = <T extends Pick<State, "frog" | "width" | "height" | "status">>(
  state: T,
  direction: Direction,
): T => {
  if (!GameStatus.isPlaying(state.status)) return state;
  const { dx, dy } = Direction.delta[direction];
  return {
    ...state,
    frog: {
      x: clamp(Math.round(state.frog.x) + dx, state.width - 1),
      y: clamp(state.frog.y + dy, state.height - 1),
    },
  };
};
