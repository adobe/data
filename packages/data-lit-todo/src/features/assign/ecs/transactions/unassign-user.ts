// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { Assignment } from "../../data/values/assignment/assignment.js";
import type { CoreDatabase } from "../core/core-database.js";

// Remove a user (by name) from a todo's assignee list.
export const unassignUser = (
  t: CoreDatabase.Store,
  { todo, name }: { readonly todo: Entity; readonly name: string },
) => {
  const row = t.read(todo);
  if (row?.todo !== true) return; // only todos carry assignees
  t.update(todo, { assignees: Assignment.unassign(row.assignees ?? [], name) });
};
