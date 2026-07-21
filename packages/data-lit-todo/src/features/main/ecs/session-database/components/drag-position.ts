// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DragPosition } from "../../../data/drag-position/drag-position.js";

// Live vertical pixel offset while a todo is being dragged. Bare schema here;
// the session scope (nonPersistent + nonShared) is applied by
// `session-database.ts` via `Database.scope.session`.
export const dragPosition = DragPosition.schema;
