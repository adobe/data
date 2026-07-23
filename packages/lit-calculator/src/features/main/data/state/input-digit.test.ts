// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.inputDigit", () => {
  it("replaces the entry when overwriting, then appends", () => {
    const s1 = State.inputDigit(State.create(), "1");
    expect(s1.entry).toBe("1");
    expect(s1.overwrite).toBe(false);
    const s2 = State.inputDigit(s1, "2");
    expect(s2.entry).toBe("12");
  });

  it("replaces a lone leading zero rather than piling up", () => {
    const s1 = State.inputDigit(State.create(), "0");
    const s2 = State.inputDigit(s1, "5");
    expect(s2.entry).toBe("5");
  });

  it("is a no-op while an error is showing", () => {
    const err: State = { ...State.create(), error: true };
    expect(State.inputDigit(err, "5")).toBe(err);
  });
});
