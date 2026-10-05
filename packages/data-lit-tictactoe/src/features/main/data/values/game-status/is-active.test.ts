// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { isActive } from "./is-active.js";

describe("isActive", () => {
  it("is true while the game still accepts moves", () => {
    expect(isActive("idle")).toBe(true);
    expect(isActive("in_progress")).toBe(true);
  });

  it("is false once the game has ended", () => {
    expect(isActive("won")).toBe(false);
    expect(isActive("draw")).toBe(false);
  });
});
