// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createTodo } from "./create-todo.js";
import { deleteTodo } from "./delete-todo.js";
import type { DataModel } from "./data-model.js";

const emptyTodos: Pick<DataModel, "todos"> = { todos: [] };

describe("deleteTodo", () => {
  it("removes the matching todo and preserves others", () => {
    const withTodos = createTodo(
      createTodo(createTodo(emptyTodos, { name: "A" }), { name: "B" }),
      { name: "C" },
    );
    const result = deleteTodo(withTodos, { id: 2 });

    expect(result.todos.map((todo) => todo.name)).toEqual(["A", "C"]);
  });

  it("no-ops when the id is not found", () => {
    const withOne = createTodo(emptyTodos, { name: "Only" });
    const result = deleteTodo(withOne, { id: 99 });

    expect(result.todos).toEqual(withOne.todos);
  });
});
