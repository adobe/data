// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Assignment } from "./assignment.js";

describe("Assignment.unassign", () => {
  it("removes a name", () => {
    expect(Assignment.unassign(["ada", "linus"], "ada")).toEqual(["linus"]);
  });

  it("is a no-op for an absent name", () => {
    expect(Assignment.unassign(["ada"], "linus")).toEqual(["ada"]);
  });

  it("does not mutate the input", () => {
    const before = ["ada", "linus"];
    Assignment.unassign(before, "ada");
    expect(before).toEqual(["ada", "linus"]);
  });
});
