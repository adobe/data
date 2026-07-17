// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

const s: State = {
  todos: [
    { id: 1, name: "a", complete: false },
    { id: 2, name: "b", complete: true },
  ],
  displayCompleted: false,
};

describe("State.visibleTodos", () => {
  it("hides completed todos unless displayCompleted", () => {
    expect(State.visibleTodos(s).map((t) => t.id)).toEqual([1]);
    expect(State.visibleTodos({ ...s, displayCompleted: true }).map((t) => t.id)).toEqual([1, 2]);
  });
});
