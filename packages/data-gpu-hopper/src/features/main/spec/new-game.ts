// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { create } from "./create.js";

// Start over: ignores the prior state and produces the initial game.
export const newGame = (_state: State): State => create();
