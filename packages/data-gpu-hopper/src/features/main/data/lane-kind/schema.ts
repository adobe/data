// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// The terrain type of a board row:
//   grass — solid, always safe (start row and the median)
//   road  — cars cross it; touching one is fatal
//   river — open water; fatal unless riding a log
//   goal  — the top row the frog is trying to reach
export const schema = {
  type: "string",
  enum: ["grass", "road", "river", "goal"],
  default: "grass",
} as const satisfies Schema;
