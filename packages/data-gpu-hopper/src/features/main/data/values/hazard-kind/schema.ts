// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { HazardKind } from "./hazard-kind.js";
import { Schema } from "@adobe/data/schema";

// The two moving hazards: a `car` (kills on contact) and a `log` (rideable).
export const schema = {
  type: "string",
  enum: ["car", "log"],
  default: "car",
} as const satisfies Schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, HazardKind>>;
