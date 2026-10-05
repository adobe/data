// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { GameStatus } from "./game-status.js";
import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  enum: ["idle", "in_progress", "won", "draw"],
} as const satisfies Schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, GameStatus>>;
