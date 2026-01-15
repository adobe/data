// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from "vitest";
import { add } from "../../dist/assembly/index.js";

describe("Assembly", () => {
  test("should be able to call assembly script functions", () => {
    expect(add(40, 2)).toBe(42);
  });
});
