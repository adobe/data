// © 2026 Adobe. MIT License. See /LICENSE for details.
import { TodoStore } from '../create-todo-store.js';

/**
 * Ensures each todo has an monotonically increasing integer order value.
 * You might call this after inserting a todo with a floating point order value for insertion.
 */
export const reorderTodos = (t: TodoStore) => {
  const todos = t.select(t.archetypes.Todo.components, { order: { order: true } });
  for (let i = 0; i < todos.length; i++) {
    t.update(todos[i], { order: i });
  }
};
