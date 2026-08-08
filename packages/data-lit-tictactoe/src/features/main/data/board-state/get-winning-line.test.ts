// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { getWinningLine } from "./get-winning-line.js";

describe("getWinningLine", () => {
  it("is null when there is no completed line", () => {
    expect(getWinningLine("         ")).toBeNull();
    expect(getWinningLine("XO       ")).toBeNull();
  });

  it("finds a winning row", () => {
    expect(getWinningLine("XXXOO    ")).toEqual([0, 1, 2]);
  });

  it("finds a winning column", () => {
    expect(getWinningLine("XO XO X  ")).toEqual([0, 3, 6]);
  });

  it("finds a top-left-to-bottom-right diagonal", () => {
    expect(getWinningLine("XO OX   X")).toEqual([0, 4, 8]);
  });

  it("finds a top-right-to-bottom-left diagonal", () => {
    expect(getWinningLine("OOXXX X  ")).toEqual([2, 4, 6]);
  });
});
