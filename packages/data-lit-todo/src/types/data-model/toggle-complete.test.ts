// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createTodo } from "./create-todo.js";
import { toggleComplete } from "./toggle-complete.js";
import type { DataModel } from "./data-model.js";

const emptyTodos: Pick<DataModel, "todos"> = { todos: [] };

describe("toggleComplete", () => {
  it("marks an incomplete todo complete", () => {
    const withTodo = createTodo(emptyTodos, { name: "Test" });
    const result = toggleComplete(withTodo, { id: 1 });

    expect(result.todos[0]?.complete).toBe(true);
  });

  it("marks a complete todo incomplete", () => {
    const complete = createTodo(emptyTodos, { name: "Test", complete: true });
    const result = toggleComplete(complete, { id: 1 });

    expect(result.todos[0]?.complete).toBe(false);
  });

  it("no-ops when the id is not found", () => {
    const withTodo = createTodo(emptyTodos, { name: "Test" });
    const result = toggleComplete(withTodo, { id: 99 });

    expect(result.todos).toEqual(withTodo.todos);
  });
});
