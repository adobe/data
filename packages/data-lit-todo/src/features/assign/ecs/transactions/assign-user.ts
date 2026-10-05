// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { Assignment } from "../../data/values/assignment/assignment.js";
import type { CoreDatabase } from "../core/core-database.js";

// Assign a user (by name) to a todo. Applies the pure `Assignment.assign`
// transform to the todo's denormalized `assignees` list; the store's indexes
// update eagerly, so `todosByAssignee` reflects the new link immediately.
export const assignUser = (
  t: CoreDatabase.Store,
  { todo, name }: { readonly todo: Entity; readonly name: string },
) => {
  const row = t.read(todo);
  if (row?.todo !== true) return; // only todos carry assignees
  t.update(todo, { assignees: Assignment.assign(row.assignees ?? [], name) });
};
