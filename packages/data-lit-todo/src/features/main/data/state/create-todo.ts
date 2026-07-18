// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

const nextTodoId = (state: Pick<State, "todos">): number =>
  state.todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;

export const createTodo = <T extends Pick<State, "todos">>(
  state: T,
  input: { readonly name: string; readonly complete?: boolean },
): T => ({
  ...state,
  todos: [
    ...state.todos,
    { id: nextTodoId(state), name: input.name, complete: input.complete ?? false },
  ],
});
