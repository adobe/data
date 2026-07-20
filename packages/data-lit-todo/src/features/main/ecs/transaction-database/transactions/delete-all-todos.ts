// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SessionDatabase } from "../../session-database/session-database.js";

export const deleteAllTodos = (t: SessionDatabase.Store) => {
  for (const archetype of t.queryArchetypes(t.archetypes.Todo.components)) {
    for (let row = archetype.rowCount - 1; row >= 0; row--) {
      t.delete(archetype.columns.id.get(row));
    }
  }
};
