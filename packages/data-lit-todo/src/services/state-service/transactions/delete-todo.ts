// © 2026 Adobe. MIT License. See /LICENSE for details.
import { reorderTodos } from './reorder-todos.js';
import type { Entity } from "@adobe/data/ecs";

import { type TodoStore } from '../create-todo-store.js';

export const deleteTodo = (t: TodoStore, id: Entity) => {
  t.undoable = { coalesce: false };
  t.delete(id);
  reorderTodos(t);
};
