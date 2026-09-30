// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { getMoveCount } from "./get-move-count.js";

describe("getMoveCount", () => {
  it("is zero for an empty board", () => {
    expect(getMoveCount("         ")).toBe(0);
  });

  it("counts both players' marks", () => {
    expect(getMoveCount("XO       ")).toBe(2);
    expect(getMoveCount("XOXXOOOXX")).toBe(9);
  });
});
