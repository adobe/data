// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { DragPosition } from "./drag-position.js";
import { F32, Schema } from "@adobe/data/schema";

// Transient vertical pixel offset while a todo is being dragged; `null` when
// the todo is not currently being dragged.
export const schema = Schema.Nullable(F32.schema);

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, DragPosition>>;
