// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.clear` (no args), shared
// with the ecs `clear` transaction. `clear` ignores its input entirely and
// returns the initial state, so every case's `after` is `State.create()` —
// exercised from mid-entry, from a latched error, and from the initial state.
export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "resets a mid-entry calculation to the initial state",
    before: { accumulator: 9, entry: "9.", operation: "add", overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 0, entry: "0", operation: null, overwrite: true, error: false },
  },
  {
    name: "resets from a latched error",
    before: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
    args: undefined,
    after: { accumulator: 0, entry: "0", operation: null, overwrite: true, error: false },
  },
  {
    name: "is idempotent from the initial state",
    before: { accumulator: 0, entry: "0", operation: null, overwrite: true, error: false },
    args: undefined,
    after: { accumulator: 0, entry: "0", operation: null, overwrite: true, error: false },
  },
];
