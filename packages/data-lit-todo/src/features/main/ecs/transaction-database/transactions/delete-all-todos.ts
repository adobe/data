// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const deleteAllTodos = (t: CoreDatabase.Store) => {
  for (const archetype of t.queryArchetypes(t.archetypes.Todo.components)) {
    for (let row = archetype.rowCount - 1; row >= 0; row--) {
      t.delete(archetype.columns.id.get(row));
    }
  }
};
