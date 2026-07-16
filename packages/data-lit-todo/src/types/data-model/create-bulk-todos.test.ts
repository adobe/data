// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createBulkTodos } from "./create-bulk-todos.js";
import { createTodo } from "./create-todo.js";
import type { DataModel } from "./data-model.js";

const emptyTodos: Pick<DataModel, "todos"> = { todos: [] };

describe("createBulkTodos", () => {
  it("adds numbered placeholder todos", () => {
    const result = createBulkTodos(emptyTodos, { count: 3 });

    expect(result.todos).toEqual([
      { id: 1, name: "Todo 0", complete: false },
      { id: 2, name: "Todo 1", complete: false },
      { id: 3, name: "Todo 2", complete: false },
    ]);
  });

  it("continues numbering from existing todos", () => {
    const withOne = createTodo(emptyTodos, { name: "Existing" });
    const result = createBulkTodos(withOne, { count: 2 });

    expect(result.todos).toHaveLength(3);
    expect(result.todos[1]?.name).toBe("Todo 1");
    expect(result.todos[2]?.name).toBe("Todo 2");
    expect(result.todos[2]?.id).toBe(3);
  });

  it("no-ops for zero or negative counts", () => {
    expect(createBulkTodos(emptyTodos, { count: 0 })).toBe(emptyTodos);
    expect(createBulkTodos(emptyTodos, { count: -2 })).toBe(emptyTodos);
  });
});
