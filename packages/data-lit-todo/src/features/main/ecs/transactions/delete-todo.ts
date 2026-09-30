// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core/core-database.js";

// A no-op for an id that names no todo (including another feature's entity).
export const deleteTodo = (t: CoreDatabase.Store, { id }: { id: Entity }) => {
  if (t.read(id, t.archetypes.Todo) !== null) t.delete(id);
};
