// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Assignment } from "../data/values/assignment/assignment.js";
import type { State } from "./state.js";

// Assign a user (by name) to a todo. A no-op for an id that names no todo.
export const assignUser = (
  state: Pick<State, "todos">,
  { todo, name }: { readonly todo: number; readonly name: string },
): Pick<State, "todos"> => {
  const current = state.todos.get(todo);
  if (current === undefined) return { todos: state.todos };
  return { todos: new Map(state.todos).set(todo, { ...current, assignees: Assignment.assign(current.assignees, name) }) };
};
