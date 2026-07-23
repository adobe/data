// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.inputDecimal", () => {
  it("starts a fresh '0.' when overwriting", () => {
    const s = State.inputDecimal(State.create());
    expect(s.entry).toBe("0.");
    expect(s.overwrite).toBe(false);
  });

  it("appends a point to an in-progress entry", () => {
    const s = State.inputDecimal(State.inputDigit(State.create(), "1"));
    expect(s.entry).toBe("1.");
  });

  it("ignores a second decimal point (idempotent)", () => {
    const s = State.inputDecimal(State.inputDigit(State.create(), "1"));
    expect(State.inputDecimal(s)).toBe(s);
  });

  it("is a no-op while an error is showing", () => {
    const err: State = { ...State.create(), error: true };
    expect(State.inputDecimal(err)).toBe(err);
  });
});
