// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { selectVisible } from "./select-visible.js";

describe("selectVisible", () => {
  it("returns all todos when displayCompleted is true", () => {
    expect(
      selectVisible({
        displayCompleted: true,
        allTodos: [1, 2, 3],
        incompleteTodos: [2, 3],
      }),
    ).toEqual([1, 2, 3]);
  });

  it("returns only incomplete todos when displayCompleted is false", () => {
    expect(
      selectVisible({
        displayCompleted: false,
        allTodos: [1, 2, 3],
        incompleteTodos: [2, 3],
      }),
    ).toEqual([2, 3]);
  });
});
