// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createTodo } from "./create-todo.js";
import type { DataModel } from "./data-model.js";

const emptyTodos: Pick<DataModel, "todos"> = { todos: [] };

describe("createTodo", () => {
  it("appends a todo with the next id and default complete false", () => {
    const result = createTodo(emptyTodos, { name: "Buy groceries" });

    expect(result.todos).toEqual([
      { id: 1, name: "Buy groceries", complete: false },
    ]);
  });

  it("respects complete when provided", () => {
    const result = createTodo(emptyTodos, { name: "Done item", complete: true });

    expect(result.todos[0]?.complete).toBe(true);
  });

  it("assigns monotonically increasing ids", () => {
    const first = createTodo(emptyTodos, { name: "First" });
    const second = createTodo(first, { name: "Second" });

    expect(second.todos.map((todo) => todo.id)).toEqual([1, 2]);
  });
});
