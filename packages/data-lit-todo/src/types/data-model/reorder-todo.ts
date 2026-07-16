// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DataModel } from "./data-model.js";

/**
 * Moves the todo with the given id to `toIndex` within the list, preserving the
 * relative order of every other todo. Out-of-range indices are clamped and an
 * unknown id is a no-op.
 */
export const reorderTodo = <T extends Pick<DataModel, "todos">>(
  model: T,
  input: { readonly id: number; readonly toIndex: number },
): T => {
  const fromIndex = model.todos.findIndex((todo) => todo.id === input.id);
  if (fromIndex === -1) return model;

  const moved = model.todos[fromIndex];
  const without = model.todos.filter((todo) => todo.id !== input.id);
  const toIndex = Math.max(0, Math.min(input.toIndex, without.length));

  return {
    ...model,
    todos: [...without.slice(0, toIndex), moved, ...without.slice(toIndex)],
  };
};
