// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// An RGBA colour, each channel 0..1. The array form `[r, g, b, a]` is what
// data-gpu's colour materials consume directly.
export const schema = {
  type: "array",
  items: { type: "number" },
  minItems: 4,
  maxItems: 4,
  default: [1, 1, 1, 1],
} as const satisfies Schema;
