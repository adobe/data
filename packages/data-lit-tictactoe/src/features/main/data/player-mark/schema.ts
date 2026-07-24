// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  enum: ["X", "O"],
  description: "Player mark",
  default: "X",
} as const satisfies Schema;
