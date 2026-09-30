// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { values } from "./values.js";

describe("values", () => {
  it("is the two player marks", () => {
    expect(values).toEqual(["X", "O"]);
  });
});
