// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { currentPlayer } from "./current-player.js";

describe("currentPlayer", () => {
  it("is the first player on an empty board", () => {
    expect(currentPlayer("         ", "X")).toBe("X");
  });

  it("alternates after each move (first player X)", () => {
    expect(currentPlayer("X        ", "X")).toBe("O");
    expect(currentPlayer("XO       ", "X")).toBe("X");
  });

  it("honors a non-default first player", () => {
    expect(currentPlayer("         ", "O")).toBe("O");
    expect(currentPlayer("O        ", "O")).toBe("X");
    expect(currentPlayer("OX       ", "O")).toBe("O");
  });
});
