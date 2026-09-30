// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { fromMarks } from "./from-marks.js";

describe("fromMarks", () => {
  it("is a blank board for no marks", () => {
    expect(fromMarks([])).toBe("         ");
  });

  it("projects marks into their index-addressed cells", () => {
    expect(
      fromMarks([
        { mark: "X", cellIndex: 0 },
        { mark: "O", cellIndex: 4 },
        { mark: "X", cellIndex: 8 },
      ]),
    ).toBe("X   O   X");
  });
});
