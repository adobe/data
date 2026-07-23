// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Operation } from "../operation/operation.js";
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.setOperation`, shared
// with the ecs `setOperation` transaction. Covers every branch: latching the
// first operation commits the entry as the left operand, pressing another op
// right after only swaps the pending one, a running calculation is folded
// before the next op is armed, a folded divide-by-zero latches the error, and
// an error latches (no-op).
export const cases: readonly ConformanceCase<Operation>[] = [
  {
    name: "latches the operation and commits the entry as the left operand",
    before: { accumulator: 0, entry: "5", operation: null, overwrite: false, error: false },
    args: "add",
    after: { accumulator: 5, entry: "5", operation: "add", overwrite: true, error: false },
  },
  {
    name: "just swaps the pending op when pressed right after another op",
    before: { accumulator: 5, entry: "5", operation: "add", overwrite: true, error: false },
    args: "multiply",
    after: { accumulator: 5, entry: "5", operation: "multiply", overwrite: true, error: false },
  },
  {
    name: "folds a running calculation before latching the next op",
    before: { accumulator: 2, entry: "3", operation: "add", overwrite: false, error: false },
    args: "add",
    after: { accumulator: 5, entry: "5", operation: "add", overwrite: true, error: false },
  },
  {
    name: "propagates a divide-by-zero error raised while folding",
    before: { accumulator: 6, entry: "0", operation: "divide", overwrite: false, error: false },
    args: "add",
    after: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
  },
  {
    name: "is a no-op while an error is showing",
    before: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
    args: "add",
    after: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
  },
];
