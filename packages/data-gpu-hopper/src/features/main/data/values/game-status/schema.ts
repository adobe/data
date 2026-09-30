// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { GameStatus } from "./game-status.js";
import { Schema } from "@adobe/data/schema";

// Whether the game is in play, cleared, or over (all lives spent).
export const schema = {
  type: "string",
  enum: ["playing", "won", "gameOver"],
  default: "playing",
} as const satisfies Schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, GameStatus>>;
