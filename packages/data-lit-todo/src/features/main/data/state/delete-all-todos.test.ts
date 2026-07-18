// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.deleteAllTodos", () => {
  it("empties the todo list, leaving other state intact", () => {
    const s: State = {
      todos: [{ id: 1, name: "a", complete: false }],
      displayCompleted: true,
    };
    const result = State.deleteAllTodos(s);
    expect(result.todos).toEqual([]);
    expect(result.displayCompleted).toBe(true);
  });
});
