// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { setBoardCell } from "./set-board-cell.js";

describe("setBoardCell", () => {
  it("places a mark at the first cell", () => {
    expect(setBoardCell({ board: "         ", index: 0, mark: "X" })).toBe(
      "X        ",
    );
  });

  it("places a mark at the last cell", () => {
    expect(setBoardCell({ board: "         ", index: 8, mark: "O" })).toBe(
      "        O",
    );
  });

  it("leaves the other cells untouched", () => {
    expect(setBoardCell({ board: "X   O    ", index: 4, mark: "X" })).toBe(
      "X   X    ",
    );
  });
});
