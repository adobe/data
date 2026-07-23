// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Operation } from "./operation.js";

// The arithmetic each operation performs, owned by the type. Division by zero
// yields a non-finite result, which the caller treats as an error display.
export const apply: Record<Operation, (left: number, right: number) => number> = {
  add: (left, right) => left + right,
  subtract: (left, right) => left - right,
  multiply: (left, right) => left * right,
  divide: (left, right) => left / right,
};
