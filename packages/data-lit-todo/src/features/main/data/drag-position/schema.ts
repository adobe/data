// © 2026 Adobe. MIT License. See /LICENSE for details.
import { F32, Schema } from "@adobe/data/schema";

// Transient vertical pixel offset while a todo is being dragged; `null` when
// the todo is not currently being dragged.
export const schema = Schema.nullable(F32.schema);
