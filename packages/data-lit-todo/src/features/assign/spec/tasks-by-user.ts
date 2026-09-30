// © 2026 Adobe. MIT License. See /LICENSE for details.
import { compare } from "@adobe/data/functions";
import type { State } from "./state.js";

// Each user (sorted by name) with the names of the todos assigned to them, in
// display order.
export const tasksByUser = (
  state: State,
): readonly { readonly user: string; readonly tasks: readonly string[] }[] =>
  [...state.users.values()]
    .map((user) => user.name)
    .sort(compare)
    .map((user) => ({
      user,
      tasks: [...state.todos.values()]
        .filter((todo) => todo.assignees.includes(user))
        .sort((a, b) => a.order - b.order)
        .map((todo) => todo.name),
    }));
