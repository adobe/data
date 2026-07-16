// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DataModel } from "./data-model.js";

/** Adds numbered placeholder todos for demos and performance testing. */
export const createBulkTodos = <T extends Pick<DataModel, "todos">>(
  model: T,
  input: { readonly count: number },
): T => {
  const count = Math.max(0, Math.floor(input.count));
  if (count === 0) {
    return model;
  }

  const startIndex = model.todos.length;
  const nextId =
    model.todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;
  const newTodos = Array.from({ length: count }, (_, index) => ({
    id: nextId + index,
    name: `Todo ${startIndex + index}`,
    complete: false,
  }));

  return {
    ...model,
    todos: [...model.todos, ...newTodos],
  };
};
