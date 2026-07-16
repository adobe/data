// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DataModel } from "./data-model.js";

const nextTodoId = (model: Pick<DataModel, "todos">): number =>
  model.todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;

export const createTodo = <T extends Pick<DataModel, "todos">>(
  model: T,
  input: { readonly name: string; readonly complete?: boolean },
): T => ({
  ...model,
  todos: [
    ...model.todos,
    {
      id: nextTodoId(model),
      name: input.name,
      complete: input.complete ?? false,
    },
  ],
});
