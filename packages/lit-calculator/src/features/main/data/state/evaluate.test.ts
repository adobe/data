// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.evaluate", () => {
  it("applies the pending operation to (accumulator, entry)", () => {
    // 12 + 3 = 15
    let s = State.inputDigit(State.create(), "1");
    s = State.inputDigit(s, "2");
    s = State.setOperation(s, "add");
    s = State.inputDigit(s, "3");
    s = State.evaluate(s);
    expect(s.entry).toBe("15");
    expect(s.accumulator).toBe(15);
    expect(s.operation).toBe(null);
  });

  it("chains: the result becomes the left operand of the next operation", () => {
    // 2 + 3 = 5, then + 4 = 9
    let s = State.inputDigit(State.create(), "2");
    s = State.setOperation(s, "add");
    s = State.inputDigit(s, "3");
    s = State.evaluate(s);
    s = State.setOperation(s, "add");
    s = State.inputDigit(s, "4");
    s = State.evaluate(s);
    expect(s.entry).toBe("9");
  });

  it("handles decimal operands", () => {
    // 1.5 × 2 = 3
    let s = State.inputDigit(State.create(), "1");
    s = State.inputDecimal(s);
    s = State.inputDigit(s, "5");
    s = State.setOperation(s, "multiply");
    s = State.inputDigit(s, "2");
    s = State.evaluate(s);
    expect(s.entry).toBe("3");
  });

  it("subtracts and divides", () => {
    // 9 − 4 = 5
    let sub = State.inputDigit(State.create(), "9");
    sub = State.setOperation(sub, "subtract");
    sub = State.inputDigit(sub, "4");
    expect(State.evaluate(sub).entry).toBe("5");
    // 8 ÷ 2 = 4
    let div = State.inputDigit(State.create(), "8");
    div = State.setOperation(div, "divide");
    div = State.inputDigit(div, "2");
    expect(State.evaluate(div).entry).toBe("4");
  });

  it("flags divide-by-zero as an error", () => {
    let s = State.inputDigit(State.create(), "6");
    s = State.setOperation(s, "divide");
    s = State.inputDigit(s, "0");
    s = State.evaluate(s);
    expect(s.error).toBe(true);
    expect(s.operation).toBe(null);
  });

  it("is a no-op with no pending operation", () => {
    const s = State.inputDigit(State.create(), "7");
    expect(State.evaluate(s)).toBe(s);
  });
});
