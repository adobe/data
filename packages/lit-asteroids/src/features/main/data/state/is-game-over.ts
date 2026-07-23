// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// The game is over once every life is spent.
export const isGameOver = (state: Pick<State, "lives">): boolean => state.lives <= 0;
