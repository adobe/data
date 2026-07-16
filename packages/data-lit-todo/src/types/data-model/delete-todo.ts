// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DataModel } from "./data-model.js";

export const deleteTodo = <T extends Pick<DataModel, "todos">>(
  model: T,
  input: { readonly id: number },
): T => ({
  ...model,
  todos: model.todos.filter((todo) => todo.id !== input.id),
});
