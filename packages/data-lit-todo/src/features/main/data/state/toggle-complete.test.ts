// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.toggleComplete", () => {
  it("flips only the matching todo's complete flag", () => {
    const s: State = {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: false },
      ],
      displayCompleted: false,
    };
    expect(State.toggleComplete(s, { id: 1 }).todos).toEqual([
      { id: 1, name: "a", complete: true },
      { id: 2, name: "b", complete: false },
    ]);
  });
});
