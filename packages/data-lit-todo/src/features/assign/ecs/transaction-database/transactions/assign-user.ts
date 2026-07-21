// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { Assignment } from "../../../data/assignment/assignment.js";
import type { DocumentDatabase } from "../../document-database/document-database.js";

// Assign a user (by name) to a todo. Applies the pure `Assignment.assign`
// transform to the todo's denormalized `assignees` list; the store's indexes
// update eagerly, so `todosByAssignee` reflects the new link immediately.
export const assignUser = (
  t: DocumentDatabase.Store,
  { todo, name }: { readonly todo: Entity; readonly name: string },
) => {
  const current = t.read(todo)?.assignees ?? [];
  t.update(todo, { assignees: Assignment.assign(current, name) });
};
