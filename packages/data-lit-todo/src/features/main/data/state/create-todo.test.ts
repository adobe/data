// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.createTodo", () => {
  it("appends a todo with the next id", () => {
    const s0: State = { todos: [], displayCompleted: false };
    const s1 = State.createTodo(s0, { name: "a" });
    expect(s1.todos).toEqual([{ id: 1, name: "a", complete: false }]);
    const s2 = State.createTodo(s1, { name: "b", complete: true });
    expect(s2.todos).toEqual([
      { id: 1, name: "a", complete: false },
      { id: 2, name: "b", complete: true },
    ]);
  });
});
