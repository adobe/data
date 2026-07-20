// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS components — each binds a data-type (or primitive) schema into column storage.
import { True, Boolean, F32, Schema } from "@adobe/data/schema";
import { DragPosition } from "../../data/drag-position/drag-position.js";

export const todo = True.schema; // tag: presence marks the entity as a todo
export const name = { type: "string" } as const satisfies Schema; // shared: todos and users
export const complete = Boolean.schema;
export const order = F32.schema; // sort key for display order
export const dragPosition = DragPosition.schema;
// Assigned user names, denormalized for display. Main owns and renders this;
// the assign feature owns the interaction (dropdown, users) and the indexes
// that make it queryable both ways. Default [] so every todo carries it.
export const assignees = { type: "array", items: { type: "string" }, default: [] } as const satisfies Schema;
