// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { GameStatus } from "./game-status.js";

// Whether the game is still accepting moves.
export const isActive = (status: GameStatus): boolean =>
  status === "idle" || status === "in_progress";
