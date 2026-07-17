// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

export const deleteAllTodos = <T extends Pick<State, "todos">>(state: T): T => ({
  ...state,
  todos: [],
});
