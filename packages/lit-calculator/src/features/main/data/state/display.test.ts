// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.display", () => {
  it("shows the initial zero", () => {
    expect(State.display(State.create())).toBe("0");
  });

  it("shows the current entry while typing", () => {
    expect(State.display(State.inputDigit(State.create(), "4"))).toBe("4");
  });

  it("shows 'Error' while an error is latched", () => {
    const err: State = { ...State.create(), error: true };
    expect(State.display(err)).toBe("Error");
  });
});
