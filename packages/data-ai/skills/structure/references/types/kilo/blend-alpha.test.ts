import { describe, expect, it } from "vitest";
import { blendAlpha } from "./blend-alpha.js";

describe("blendAlpha", () => {
  it("interpolates and clamps the result", () => {
    expect(blendAlpha(0, 1, 0.5)).toBe(0.5);
    expect(blendAlpha(0, 1, 2)).toBe(1);
    expect(blendAlpha(0, 1, -1)).toBe(0);
  });
});
