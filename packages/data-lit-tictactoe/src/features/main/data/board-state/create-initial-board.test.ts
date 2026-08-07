// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createInitialBoard } from "./create-initial-board.js";

describe("createInitialBoard", () => {
  it("is nine blank cells", () => {
    expect(createInitialBoard()).toBe("         ");
    expect(createInitialBoard()).toHaveLength(9);
  });
});
