// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { Digit } from "../../data/digit/digit.js";
import { Operation } from "../../data/operation/operation.js";
import { render } from "./calculator-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  display: "0",
  inputDigit: () => {},
  inputDecimal: () => {},
  setOperation: () => {},
  evaluate: () => {},
  clear: () => {},
  ...over,
});

describe("calculator-presentation", () => {
  it("shows the current display string", () => {
    const t = Template.from(render(props({ display: "42" })));
    expect(t.has("display")).toBe(true);
    expect(t.text).toContain("42");
  });

  it("renders a key for every digit and every operation glyph", () => {
    const t = Template.from(render(props()));
    for (const digit of Digit.values) {
      expect(t.text).toContain(digit);
    }
    for (const operation of Operation.values) {
      expect(t.text).toContain(Operation.sign[operation]);
    }
  });

  it("wires the fixed clear / decimal / equals keys by identity", () => {
    const inputDecimal = () => {};
    const evaluate = () => {};
    const clear = () => {};
    const t = Template.from(render(props({ inputDecimal, evaluate, clear })));
    expect(t.values).toContain(clear);
    expect(t.values).toContain(inputDecimal);
    expect(t.values).toContain(evaluate);
  });

  it("invokes inputDigit for every digit and setOperation for every operation", () => {
    const digits: string[] = [];
    const operations: string[] = [];
    const t = Template.from(
      render(props({ inputDigit: (d) => digits.push(d), setOperation: (o) => operations.push(o) })),
    );
    for (const value of t.values) {
      if (typeof value === "function") value();
    }
    expect(new Set(digits)).toEqual(new Set(Digit.values));
    expect(new Set(operations)).toEqual(new Set(Operation.values));
  });
});
