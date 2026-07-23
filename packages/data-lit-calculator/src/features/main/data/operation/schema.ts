// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// The four calculator operations. Each member's arithmetic lives with the
// type (see `apply.ts`); nothing outside this folder spells the members.
export const schema = {
  type: "string",
  enum: ["add", "subtract", "multiply", "divide"],
  description: "Arithmetic operation",
  default: "add",
} as const satisfies Schema;
