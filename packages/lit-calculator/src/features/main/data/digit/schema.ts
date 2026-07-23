// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// A single decimal digit key. The closed set 0–9 is owned here so no caller
// re-spells the members.
export const schema = {
  type: "string",
  enum: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  description: "A single decimal digit",
  default: "0",
} as const satisfies Schema;
