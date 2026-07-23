// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.clear", () => {
  it("resets everything to the initial state", () => {
    expect(State.clear()).toEqual(State.create());
  });
});
