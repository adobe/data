// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** The initial presence state: no cursors reported yet. */
export const create = (): State => ({ cursors: {} });
