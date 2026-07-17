// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS components — each binds a data-type (or primitive) schema into column storage.
import { True, Boolean, F32, Schema } from "@adobe/data/schema";
import { DragPosition } from "../../data/drag-position/drag-position.js";

export const todo = True.schema; // tag: presence marks the entity as a todo
export const name = { type: "string" } as const satisfies Schema;
export const complete = Boolean.schema;
export const order = F32.schema; // sort key for display order
export const dragPosition = DragPosition.schema;
