// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
// Assigned user names, denormalized for display. Main owns and renders this;
// the assign feature owns the interaction and the indexes that make it
// queryable both ways. Default [] so every todo carries it.
export const assignees = { type: "array", items: { type: "string" }, default: [] } as const satisfies Schema;
