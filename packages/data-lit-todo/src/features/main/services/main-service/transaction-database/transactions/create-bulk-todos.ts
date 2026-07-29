// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../../core-database/core-database.js";
import { createTodo } from "./create-todo.js";

export const createBulkTodos = (
  t: CoreDatabase.Store,
  input: { readonly count: number },
) => {
  const count = Math.max(0, Math.floor(input.count));
  const startIndex = t.archetypes.Todo.rowCount;
  for (let index = 0; index < count; index++) {
    createTodo(t, { name: `Todo ${startIndex + index}`, complete: false });
  }
};
