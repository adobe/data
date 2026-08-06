// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { ConnectionState } from "./connection-state.js";

export const schema = {
  type: "string",
  enum: ["idle", "connecting", "connected", "disconnected", "reconnecting"],
} as const satisfies Schema;

// Compile-time pin: fails to build if schema and type diverge.
type _Pin = Assert<Equal<Schema.ToType<typeof schema>, ConnectionState>>;
