// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { Assignment } from "../../data/assignment/assignment.js";
import type { CoreDatabase } from "../core-database.js";

// Remove a user (by name) from a todo's assignee list.
export const unassignUser = (
  t: CoreDatabase.Store,
  { todo, name }: { readonly todo: Entity; readonly name: string },
) => {
  const current = t.read(todo)?.assignees ?? [];
  t.update(todo, { assignees: Assignment.unassign(current, name) });
};
