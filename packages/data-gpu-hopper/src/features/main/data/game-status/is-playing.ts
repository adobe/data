// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { GameStatus } from "./game-status.js";

// Whether the simulation should still respond to input and ticks.
export const isPlaying = (status: GameStatus): boolean => status === "playing";
