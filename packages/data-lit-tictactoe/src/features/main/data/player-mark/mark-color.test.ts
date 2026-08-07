// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { markColor } from "./mark-color.js";

describe("markColor", () => {
  it("has a distinct colour string for each mark", () => {
    expect(typeof markColor.X).toBe("string");
    expect(typeof markColor.O).toBe("string");
    expect(markColor.X).not.toBe(markColor.O);
  });
});
