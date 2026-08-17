// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Point the `selectedTodo` resource at an existing todo; a no-op if the id names no
// entity, so the selection never dangles. Conforms to the `selectTodo` transition.
export const selectTodo = (t: CoreDatabase.Store, { id }: { id: Entity }) => {
  if (t.read(id)) t.resources.selectedTodo = id;
};
