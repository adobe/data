// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Lives } from "./lives.js";

describe("Lives.isGameOver", () => {
  it("is over once lives reach zero", () => {
    expect(Lives.isGameOver(0)).toBe(true);
  });

  it("is not over while a life remains", () => {
    expect(Lives.isGameOver(1)).toBe(false);
  });
});
