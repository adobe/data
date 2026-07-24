// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// A non-negative scoreboard tally (wins, draws). Starts at zero.
export const schema = {
  type: "number",
  minimum: 0,
  default: 0,
} as const satisfies Schema;
