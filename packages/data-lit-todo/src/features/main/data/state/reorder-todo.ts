// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/**
 * Moves the todo with the given id to `toIndex` within the list, preserving the
 * relative order of every other todo. Out-of-range indices are clamped and an
 * unknown id is a no-op.
 */
export const reorderTodo = <T extends Pick<State, "todos">>(
  state: T,
  input: { readonly id: number; readonly toIndex: number },
): T => {
  const fromIndex = state.todos.findIndex((todo) => todo.id === input.id);
  if (fromIndex === -1) return state;

  const moved = state.todos[fromIndex];
  const without = state.todos.filter((todo) => todo.id !== input.id);
  const toIndex = Math.max(0, Math.min(input.toIndex, without.length));

  return {
    ...state,
    todos: [...without.slice(0, toIndex), moved, ...without.slice(toIndex)],
  };
};
