// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { getWinner } from "./get-winner.js";

describe("getWinner", () => {
  it("is null on an empty board", () => {
    expect(getWinner("         ")).toBeNull();
  });

  it("is null while the game is still in progress", () => {
    expect(getWinner("XO       ")).toBeNull();
  });

  it("returns the mark that completes a row", () => {
    expect(getWinner("XXXOO    ")).toBe("X");
  });

  it("returns the mark that completes a column", () => {
    expect(getWinner("XO XO X  ")).toBe("X");
  });

  it("returns the mark that completes a diagonal", () => {
    expect(getWinner("XO OX   X")).toBe("X");
  });

  it("returns O when O wins", () => {
    expect(getWinner("OOOXX    ")).toBe("O");
  });

  it("is 'cat' when the board is full with no winner", () => {
    expect(getWinner("XOXXOOOXX")).toBe("cat");
  });
});
