import { describe, expect, it } from "vitest";
import { normalizeAlpha } from "./normalize-alpha.js";

describe("normalizeAlpha", () => {
  it("clamps, rounds, and snaps near boundaries", () => {
    expect(normalizeAlpha(-0.5)).toBe(0);
    expect(normalizeAlpha(1.5)).toBe(1);
    expect(normalizeAlpha(0.33333333)).toBe(0.3333);
    expect(normalizeAlpha(0.999999999)).toBe(1);
  });
});
