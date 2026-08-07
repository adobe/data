// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { opponent } from "./opponent.js";

describe("opponent", () => {
  it("maps each mark to the other", () => {
    expect(opponent.X).toBe("O");
    expect(opponent.O).toBe("X");
  });
});
