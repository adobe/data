// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core/core-database.js";

// Point the `selectedTodo` resource at an existing todo; a no-op for an id that names
// no todo, so the selection never dangles or points at another feature's entity.
export const selectTodo = (t: CoreDatabase.Store, { id }: { id: Entity }) => {
  if (t.read(id, t.archetypes.Todo) !== null) t.resources.selectedTodo = id;
};
