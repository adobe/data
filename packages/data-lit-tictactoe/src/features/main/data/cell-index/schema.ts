// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// Which of the nine board cells (0 top-left to 8 bottom-right) a mark occupies.
export const schema = {
  type: "integer",
  minimum: 0,
  maximum: 8,
} as const satisfies Schema;
