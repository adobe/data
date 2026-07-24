// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.isGameOver", () => {
  it("is over once lives reach zero", () => {
    expect(State.isGameOver({ lives: 0 })).toBe(true);
  });

  it("is not over while a life remains", () => {
    expect(State.isGameOver({ lives: 1 })).toBe(false);
  });
});
