// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Operation } from "../operation/operation.js";
import type { State } from "./state.js";

// Apply the pending operation to (accumulator, entry) and show the result,
// which becomes the left operand of the next operation. A non-finite result
// (e.g. divide by zero) latches the error flag. No-op when nothing is armed
// or an error is already showing.
export const evaluate = <
  T extends Pick<State, "accumulator" | "entry" | "operation" | "overwrite" | "error">,
>(
  state: T,
): T => {
  if (state.error || state.operation === null) return state;
  const result = Operation.apply[state.operation](state.accumulator, Number(state.entry));
  if (!Number.isFinite(result)) {
    return { ...state, error: true, operation: null };
  }
  return {
    ...state,
    accumulator: result,
    entry: String(result),
    operation: null,
    overwrite: true,
  };
};
