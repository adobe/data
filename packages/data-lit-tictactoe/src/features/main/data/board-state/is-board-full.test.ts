// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { isBoardFull } from "./is-board-full.js";

describe("isBoardFull", () => {
  it("is false for an empty board", () => {
    expect(isBoardFull("         ")).toBe(false);
  });

  it("is false while any cell is blank", () => {
    expect(isBoardFull("XOXXOOOX ")).toBe(false);
  });

  it("is true when every cell is filled", () => {
    expect(isBoardFull("XOXXOOOXX")).toBe(true);
  });
});
