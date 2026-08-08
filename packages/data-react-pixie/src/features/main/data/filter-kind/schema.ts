// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { FilterKind } from "./filter-kind.js";

// Carries a `default` so it binds directly as the `filter` resource schema.
export const schema = {
  type: "string",
  enum: ["none", "sepia", "blur", "vintage", "night"],
  default: "none",
} as const satisfies Schema;

// Compile-time pin: fails to build if schema and type diverge.
type _Pin = Assert<Equal<Schema.ToType<typeof schema>, FilterKind>>;
