// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createTodo } from "./create-todo.js";
import { reorderTodo } from "./reorder-todo.js";
import type { DataModel } from "./data-model.js";

const emptyTodos: Pick<DataModel, "todos"> = { todos: [] };

const withTodos = createTodo(
  createTodo(createTodo(emptyTodos, { name: "A" }), { name: "B" }),
  { name: "C" },
);

const names = (model: Pick<DataModel, "todos">) =>
  model.todos.map((todo) => todo.name);

describe("reorderTodo", () => {
  it("moves a todo to an earlier index", () => {
    const result = reorderTodo(withTodos, { id: 3, toIndex: 0 });
    expect(names(result)).toEqual(["C", "A", "B"]);
  });

  it("moves a todo to a later index", () => {
    const result = reorderTodo(withTodos, { id: 1, toIndex: 2 });
    expect(names(result)).toEqual(["B", "C", "A"]);
  });

  it("clamps an out-of-range index to the end", () => {
    const result = reorderTodo(withTodos, { id: 1, toIndex: 99 });
    expect(names(result)).toEqual(["B", "C", "A"]);
  });

  it("no-ops when the id is not found", () => {
    const result = reorderTodo(withTodos, { id: 99, toIndex: 0 });
    expect(result.todos).toEqual(withTodos.todos);
  });
});
