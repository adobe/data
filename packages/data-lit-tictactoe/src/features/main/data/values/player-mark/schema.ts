// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { PlayerMark } from "./player-mark.js";
import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  enum: ["X", "O"],
  description: "Player mark",
  default: "X",
} as const satisfies Schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, PlayerMark>>;
