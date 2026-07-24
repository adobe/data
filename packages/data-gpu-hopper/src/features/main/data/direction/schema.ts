// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// A single hop input. `ui/` maps WASD / arrow keys onto these members.
export const schema = {
  type: "string",
  enum: ["up", "down", "left", "right"],
  default: "up",
} as const satisfies Schema;
