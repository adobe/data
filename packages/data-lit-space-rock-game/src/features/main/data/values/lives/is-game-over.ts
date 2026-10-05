// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Lives } from "./lives.js";

// The game is over once every life is spent.
export const isGameOver = (lives: Lives): boolean => lives <= 0;
