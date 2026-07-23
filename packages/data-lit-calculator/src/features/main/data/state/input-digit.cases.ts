// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Digit } from "../digit/digit.js";
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.inputDigit`, shared with
// the ecs `inputDigit` transaction. Covers every branch: a fresh entry replaces
// the display, an in-progress entry appends, a lone leading zero is collapsed,
// and an error latches the entry (no-op).
export const cases: readonly ConformanceCase<Digit>[] = [
  {
    name: "replaces the display on a fresh entry (overwrite)",
    before: { accumulator: 0, entry: "0", operation: null, overwrite: true, error: false },
    args: "7",
    after: { accumulator: 0, entry: "7", operation: null, overwrite: false, error: false },
  },
  {
    name: "appends to an in-progress entry",
    before: { accumulator: 0, entry: "1", operation: null, overwrite: false, error: false },
    args: "2",
    after: { accumulator: 0, entry: "12", operation: null, overwrite: false, error: false },
  },
  {
    name: "appends a zero to an in-progress entry",
    before: { accumulator: 0, entry: "3", operation: null, overwrite: false, error: false },
    args: "0",
    after: { accumulator: 0, entry: "30", operation: null, overwrite: false, error: false },
  },
  {
    name: "collapses a lone leading zero rather than piling up",
    before: { accumulator: 0, entry: "0", operation: null, overwrite: false, error: false },
    args: "5",
    after: { accumulator: 0, entry: "5", operation: null, overwrite: false, error: false },
  },
  {
    name: "starts a fresh entry after an operation is armed",
    before: { accumulator: 5, entry: "5", operation: "add", overwrite: true, error: false },
    args: "9",
    after: { accumulator: 5, entry: "9", operation: "add", overwrite: false, error: false },
  },
  {
    name: "is a no-op while an error is showing",
    before: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
    args: "5",
    after: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
  },
];
