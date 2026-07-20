// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  enum: ["index_out_of_bounds", "game_not_active", "cell_occupied", "game_over"],
} as const satisfies Schema;
