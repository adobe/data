// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.inputDecimal` (no args),
// shared with the ecs `inputDecimal` transaction. Covers every branch: a fresh
// entry starts "0.", an in-progress entry appends a point, a second point is
// ignored (idempotent), and an error latches the entry (no-op).
export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "starts a fresh '0.' when overwriting",
    before: { accumulator: 0, entry: "0", operation: null, overwrite: true, error: false },
    args: undefined,
    after: { accumulator: 0, entry: "0.", operation: null, overwrite: false, error: false },
  },
  {
    name: "appends a point to an in-progress entry",
    before: { accumulator: 0, entry: "1", operation: null, overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 0, entry: "1.", operation: null, overwrite: false, error: false },
  },
  {
    name: "ignores a second decimal point (idempotent)",
    before: { accumulator: 0, entry: "1.", operation: null, overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 0, entry: "1.", operation: null, overwrite: false, error: false },
  },
  {
    name: "is a no-op while an error is showing",
    before: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
    args: undefined,
    after: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
  },
];
