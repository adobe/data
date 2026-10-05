// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { is } from "./is.js";

describe("is", () => {
  it("accepts the two player marks", () => {
    expect(is("X")).toBe(true);
    expect(is("O")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(is(" ")).toBe(false);
    expect(is("x")).toBe(false);
    expect(is(1)).toBe(false);
    expect(is(null)).toBe(false);
  });
});
