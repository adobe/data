// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

const s: State = {
  todos: [
    { id: 1, name: "a", complete: false },
    { id: 2, name: "b", complete: false },
    { id: 3, name: "c", complete: false },
  ],
  displayCompleted: false,
};

describe("State.reorderTodo", () => {
  it("moves a todo to the target index, preserving others", () => {
    expect(State.reorderTodo(s, { id: 1, toIndex: 2 }).todos.map((t) => t.id)).toEqual([2, 3, 1]);
  });
  it("clamps out-of-range indices and is a no-op for unknown ids", () => {
    expect(State.reorderTodo(s, { id: 3, toIndex: 99 }).todos.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(State.reorderTodo(s, { id: 42, toIndex: 0 })).toBe(s);
  });
});
