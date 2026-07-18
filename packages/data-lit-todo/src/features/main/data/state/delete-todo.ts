// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

export const deleteTodo = <T extends Pick<State, "todos">>(
  state: T,
  input: { readonly id: number },
): T => ({
  ...state,
  todos: state.todos.filter((todo) => todo.id !== input.id),
});
