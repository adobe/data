// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Assignment } from "../data/values/assignment/assignment.js";
import type { State } from "./state.js";

// Remove a user (by name) from a todo. A no-op for an id that names no todo.
export const unassignUser = (
  state: Pick<State, "todos">,
  { todo, name }: { readonly todo: number; readonly name: string },
): Pick<State, "todos"> => {
  const current = state.todos.get(todo);
  if (current === undefined) return { todos: state.todos };
  return { todos: new Map(state.todos).set(todo, { ...current, assignees: Assignment.unassign(current.assignees, name) }) };
};
