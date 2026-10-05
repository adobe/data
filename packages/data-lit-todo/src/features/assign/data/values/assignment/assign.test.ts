// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Assignment } from "./assignment.js";

describe("Assignment.assign", () => {
  it("adds a name to an empty list", () => {
    expect(Assignment.assign([], "ada")).toEqual(["ada"]);
  });

  it("is idempotent for an already-assigned name", () => {
    const before = ["ada", "linus"];
    expect(Assignment.assign(before, "ada")).toBe(before);
  });

  it("does not mutate the input", () => {
    const before = ["ada"];
    Assignment.assign(before, "linus");
    expect(before).toEqual(["ada"]);
  });
});
