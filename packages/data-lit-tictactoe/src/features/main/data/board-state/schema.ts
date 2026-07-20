// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// The board: 9 cells, top-left to bottom-right, each a space, "X", or "O".
// The empty board is the natural default.
export const schema = {
  type: "string",
  description: "Tic-Tac-Toe board top left to bottom right",
  default: "         ",
  minLength: 9,
  maxLength: 9,
} as const satisfies Schema;
