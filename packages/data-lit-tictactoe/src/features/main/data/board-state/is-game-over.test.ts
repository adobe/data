// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { isGameOver } from "./is-game-over.js";

describe("isGameOver", () => {
  it("is false on an empty board", () => {
    expect(isGameOver("         ")).toBe(false);
  });

  it("is false while the game is in progress", () => {
    expect(isGameOver("XO       ")).toBe(false);
  });

  it("is true when there is a winning line", () => {
    expect(isGameOver("XXXOO    ")).toBe(true);
  });

  it("is true when the board is full (draw)", () => {
    expect(isGameOver("XOXXOOOXX")).toBe(true);
  });
});
