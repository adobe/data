// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Operation } from "../operation/operation.js";
import type { State } from "./state.js";
import { evaluate } from "./evaluate.js";

// Arm an operation. Pressing one right after another only swaps the pending
// operation. Otherwise any pending operation is folded with the current entry
// first (running total), and its result becomes the left operand. No-op while
// an error is showing.
export const setOperation = <
  T extends Pick<State, "accumulator" | "entry" | "operation" | "overwrite" | "error">,
>(
  state: T,
  operation: Operation,
): T => {
  if (state.error) return state;
  if (state.operation !== null && state.overwrite) {
    return { ...state, operation };
  }
  const folded = evaluate(state);
  if (folded.error) return folded;
  return { ...folded, accumulator: Number(folded.entry), operation, overwrite: true };
};
