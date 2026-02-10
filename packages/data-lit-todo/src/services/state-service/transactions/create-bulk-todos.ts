// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createTodo } from './create-todo.js';

import { type TodoStore } from '../create-todo-store.js';

export const createBulkTodos = (t: TodoStore, count: number) => {
  t.undoable = { coalesce: false };
  const currentCount = t.archetypes.Todo.rowCount;
  for (let i = 0; i < count; i++) {
    createTodo(t, { name: `Todo ${currentCount + i}`, complete: false });
  }
};
