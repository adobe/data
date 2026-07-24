// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// The frog's continuous world position: `x` is the (fractional) column, `y` the
// row. Hops snap `x` to the grid; riding a log moves `x` smoothly.
export const schema = {
  type: "object",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
  },
  required: ["x", "y"],
  additionalProperties: false,
} as const satisfies Schema;
