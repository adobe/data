// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.evaluate` (no args),
// shared with the ecs `evaluate` transaction. Covers each operation (the result
// becomes the next left operand), a decimal operand, divide-by-zero latching the
// error, and the two no-ops (nothing armed, error showing).
export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "adds the accumulator and entry",
    before: { accumulator: 12, entry: "3", operation: "add", overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 15, entry: "15", operation: null, overwrite: true, error: false },
  },
  {
    name: "subtracts the entry from the accumulator",
    before: { accumulator: 9, entry: "4", operation: "subtract", overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 5, entry: "5", operation: null, overwrite: true, error: false },
  },
  {
    name: "multiplies a decimal operand",
    before: { accumulator: 1.5, entry: "2", operation: "multiply", overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 3, entry: "3", operation: null, overwrite: true, error: false },
  },
  {
    name: "divides the accumulator by the entry",
    before: { accumulator: 8, entry: "2", operation: "divide", overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 4, entry: "4", operation: null, overwrite: true, error: false },
  },
  {
    name: "flags divide-by-zero as an error",
    before: { accumulator: 6, entry: "0", operation: "divide", overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
  },
  {
    name: "is a no-op with no pending operation",
    before: { accumulator: 0, entry: "7", operation: null, overwrite: false, error: false },
    args: undefined,
    after: { accumulator: 0, entry: "7", operation: null, overwrite: false, error: false },
  },
  {
    name: "is a no-op while an error is showing",
    before: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
    args: undefined,
    after: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
  },
];
