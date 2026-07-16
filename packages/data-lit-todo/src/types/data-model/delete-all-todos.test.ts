// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createBulkTodos } from "./create-bulk-todos.js";
import { deleteAllTodos } from "./delete-all-todos.js";
import type { DataModel } from "./data-model.js";

const emptyTodos: Pick<DataModel, "todos"> = { todos: [] };

describe("deleteAllTodos", () => {
  it("removes every todo", () => {
    const withTodos = createBulkTodos(emptyTodos, { count: 3 });
    const result = deleteAllTodos(withTodos);

    expect(result.todos).toEqual([]);
  });

  it("preserves displayCompleted", () => {
    const model: Pick<DataModel, "todos" | "displayCompleted"> = {
      ...createBulkTodos(emptyTodos, { count: 1 }),
      displayCompleted: true,
    };
    const result = deleteAllTodos(model);

    expect(result.displayCompleted).toBe(true);
  });
});
