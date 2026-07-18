// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.toggleDisplayCompleted", () => {
  it("flips the displayCompleted flag", () => {
    const s: State = { todos: [], displayCompleted: false };
    expect(State.toggleDisplayCompleted(s).displayCompleted).toBe(true);
    expect(State.toggleDisplayCompleted(State.toggleDisplayCompleted(s)).displayCompleted).toBe(false);
  });
});
