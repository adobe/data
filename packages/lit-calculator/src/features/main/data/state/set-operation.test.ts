// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.setOperation", () => {
  it("latches the operation and commits the entry as the left operand", () => {
    const s = State.setOperation(State.inputDigit(State.create(), "5"), "add");
    expect(s.operation).toBe("add");
    expect(s.accumulator).toBe(5);
    expect(s.overwrite).toBe(true);
  });

  it("just swaps the pending op when pressed right after another op", () => {
    const s1 = State.setOperation(State.inputDigit(State.create(), "5"), "add");
    const s2 = State.setOperation(s1, "multiply");
    expect(s2.operation).toBe("multiply");
    expect(s2.accumulator).toBe(5);
  });

  it("folds a running calculation before latching the next op", () => {
    // 2 + 3 +  → the running total 5 becomes the new left operand
    let s = State.inputDigit(State.create(), "2");
    s = State.setOperation(s, "add");
    s = State.inputDigit(s, "3");
    s = State.setOperation(s, "add");
    expect(s.accumulator).toBe(5);
    expect(s.operation).toBe("add");
  });

  it("is a no-op while an error is showing", () => {
    const err: State = { ...State.create(), error: true };
    expect(State.setOperation(err, "add")).toBe(err);
  });
});
