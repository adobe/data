// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core/core-database.js";

// A no-op for an id that names no todo (including another feature's entity).
export const toggleComplete = (t: CoreDatabase.Store, { id }: { id: Entity }) => {
  const todo = t.read(id, t.archetypes.Todo);
  if (todo !== null) t.update(id, { complete: !todo.complete });
};
