// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Adds numbered placeholder todos for demos and performance testing. */
export const createBulkTodos = <T extends Pick<State, "todos">>(
  state: T,
  input: { readonly count: number },
): T => {
  const count = Math.max(0, Math.floor(input.count));
  if (count === 0) return state;

  const startIndex = state.todos.length;
  const nextId = state.todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;
  const newTodos = Array.from({ length: count }, (_, index) => ({
    id: nextId + index,
    name: `Todo ${startIndex + index}`,
    complete: false,
  }));

  return { ...state, todos: [...state.todos, ...newTodos] };
};
