// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ArchetypeDatabase } from "../../archetype-database/archetype-database.js";
import { createTodo } from "./create-todo.js";

export const createBulkTodos = (
  t: ArchetypeDatabase.Store,
  input: { readonly count: number },
) => {
  const count = Math.max(0, Math.floor(input.count));
  const startIndex = t.archetypes.Todo.rowCount;
  for (let index = 0; index < count; index++) {
    createTodo(t, { name: `Todo ${startIndex + index}`, complete: false });
  }
};
