// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// A todo's denormalized list of assignee names (the join key with users).
export const schema = { type: "array", items: { type: "string" }, default: [] } as const satisfies Schema;
