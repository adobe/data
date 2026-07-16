import { describe, expect, it } from "vitest";
import { isAlphaValid } from "./is-alpha-valid.js";

describe("isAlphaValid", () => {
  it("accepts finite values in [0, 1]", () => {
    expect(isAlphaValid(0)).toBe(true);
    expect(isAlphaValid(1)).toBe(true);
    expect(isAlphaValid(0.5)).toBe(true);
  });

  it("rejects out-of-range and non-finite values", () => {
    expect(isAlphaValid(-0.1)).toBe(false);
    expect(isAlphaValid(1.1)).toBe(false);
    expect(isAlphaValid(Number.NaN)).toBe(false);
    expect(isAlphaValid(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
