// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.deleteTodo", () => {
  it("removes the todo with the given id", () => {
    const s: State = {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: false,
    };
    expect(State.deleteTodo(s, { id: 1 }).todos).toEqual([
      { id: 2, name: "b", complete: false },
    ]);
  });
});
