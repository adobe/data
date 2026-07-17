// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";

// The todos the user should see, in display order: all of them when
// `displayCompleted`, otherwise only the incomplete ones.
export const visibleTodos = (
  state: Pick<State, "todos" | "displayCompleted">,
): readonly Todo[] =>
  state.displayCompleted
    ? state.todos
    : state.todos.filter((todo) => !todo.complete);
