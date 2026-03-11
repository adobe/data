// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  description: "Tic-Tac-Toe board top left to bottom right",
  minLength: 9,
  maxLength: 9,
} as const satisfies Schema;
