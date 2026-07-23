// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Operation } from "../operation/operation.js";

// The whole calculator modelled as one immutable value — the pure spec the
// implementation is verified against.
//
// - `accumulator` is the committed left operand / last result.
// - `entry` is the number currently being typed, held as text so decimals and
//   digit-building are exact; it is also what the display shows.
// - `operation` is the pending operation, or `null` when none is armed.
// - `overwrite` is true when the next digit should start a fresh entry (just
//   after arming an operation, after `=`, or after clear).
// - `error` latches a non-finite result (e.g. divide by zero).
export type State = {
  readonly accumulator: number;
  readonly entry: string;
  readonly operation: Operation | null;
  readonly overwrite: boolean;
  readonly error: boolean;
};
export * as State from "./public.js";
