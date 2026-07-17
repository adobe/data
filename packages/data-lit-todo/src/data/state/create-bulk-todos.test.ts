// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.createBulkTodos", () => {
  it("appends `count` numbered todos with unique ids", () => {
    const s: State = { todos: [], displayCompleted: false };
    const result = State.createBulkTodos(s, { count: 3 });
    expect(result.todos.map((t) => t.name)).toEqual(["Todo 0", "Todo 1", "Todo 2"]);
    expect(new Set(result.todos.map((t) => t.id)).size).toBe(3);
  });
  it("is a no-op for count 0", () => {
    const s: State = { todos: [], displayCompleted: false };
    expect(State.createBulkTodos(s, { count: 0 })).toBe(s);
  });
});
