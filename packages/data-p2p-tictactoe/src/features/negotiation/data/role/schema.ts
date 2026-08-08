// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { Role } from "./role.js";

export const schema = {
  type: "string",
  enum: ["host", "joiner"],
} as const satisfies Schema;

// Compile-time pin: fails to build if schema and type diverge.
type _Pin = Assert<Equal<Schema.ToType<typeof schema>, Role>>;
