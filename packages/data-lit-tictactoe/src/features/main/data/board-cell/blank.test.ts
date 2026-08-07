// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { blank } from "./blank.js";

describe("blank", () => {
  it("is the single-space unplayed-cell character", () => {
    expect(blank).toBe(" ");
  });
});
