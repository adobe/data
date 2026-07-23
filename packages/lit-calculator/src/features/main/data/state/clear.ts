// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { create } from "./create.js";

// Reset everything to the initial state.
export const clear = (): State => create();
