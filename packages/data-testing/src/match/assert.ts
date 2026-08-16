// © 2026 Adobe. MIT License. See /LICENSE for details.
import { matches, type MatchOptions } from "./match.js";

// A `Map`/`Set` JSON.stringifies to `{}`, which would hide the very entity
// collections these comparisons are about (two different maps both print `{}`), so
// render them explicitly. A `ref` matcher prints as `ref(label)` so an id-bijection
// mismatch is legible.
const REF = Symbol.for("@adobe/data-testing:ref");
const replacer = (_key: string, value: unknown): unknown => {
  if (value instanceof Map) return { "«Map»": [...value.entries()] };
  if (value instanceof Set) return { "«Set»": [...value.values()] };
  if (typeof value === "object" && value !== null && REF in value) return `ref(${String((value as Record<symbol, unknown>)[REF])})`;
  return value;
};

const show = (value: unknown): string => {
  try {
    return JSON.stringify(value, replacer) ?? String(value);
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
