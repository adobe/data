// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Operation } from "./operation.js";

// The glyph each operation shows on its key. Kept with the type so no
// rendering layer re-encodes the operation set.
export const sign: Record<Operation, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};
