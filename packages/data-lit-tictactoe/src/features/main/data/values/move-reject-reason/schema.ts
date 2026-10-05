// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { MoveRejectReason } from "./move-reject-reason.js";
import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  enum: ["index_out_of_bounds", "cell_occupied", "game_over"],
} as const satisfies Schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, MoveRejectReason>>;
