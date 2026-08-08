// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { deriveStatus } from "./derive-status.js";

describe("deriveStatus", () => {
  it("is idle on an empty board", () => {
    expect(deriveStatus("         ")).toBe("idle");
  });

  it("is in_progress once a mark is placed with no winner", () => {
    expect(deriveStatus("X        ")).toBe("in_progress");
  });

  it("is won when a line is complete", () => {
    expect(deriveStatus("XXXOO    ")).toBe("won");
  });

  it("is draw when the board is full with no winner", () => {
    expect(deriveStatus("XOXXOOOXX")).toBe("draw");
  });
});
