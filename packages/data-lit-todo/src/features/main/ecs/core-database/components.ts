// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Boolean, F32, True } from "@adobe/data/schema";
import { Name } from "../../data/name/name.js";
import { Assignees } from "../../data/assignees/assignees.js";
import { DragPosition } from "../../data/drag-position/drag-position.js";

export const components = Database.components({
  document: {
    todo: True.schema, // tag: presence marks the entity as a todo
    name: Name.schema,
    complete: Boolean.schema,
    order: F32.schema, // sort key for display order
    assignees: Assignees.schema,
  },
  session: {
    dragPosition: DragPosition.schema, // live drag offset; not saved, not shared
  },
});
