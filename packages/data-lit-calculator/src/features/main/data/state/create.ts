// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// The initial calculator state: showing zero, nothing armed, ready to type.
export const create = (): State => ({
  accumulator: 0,
  entry: "0",
  operation: null,
  overwrite: true,
  error: false,
});
