// © 2026 Adobe. MIT License. See /LICENSE for details.
import { matches, type MatchOptions } from "./match.js";

const show = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

// Throwing assertion built on `matches` — a mismatch throws an `Error` the test
// runner reports. Framework-agnostic (no `expect` import), so it works under any
// runner; the message shows both sides.
export const assert = (actual: unknown, expected: unknown, options?: MatchOptions): void => {
  if (!matches(actual, expected, options)) {
    throw new Error(`match failed:\n  actual:   ${show(actual)}\n  expected: ${show(expected)}`);
  }
};
