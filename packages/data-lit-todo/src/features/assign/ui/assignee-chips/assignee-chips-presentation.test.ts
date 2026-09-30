// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./assignee-chips-presentation.js";

describe("assignee-chips-presentation", () => {
  it("renders a chip per assignee", () => {
    const t = Template.from(render({ assignees: ["ada", "linus"] }));
    expect(t.text).toContain("ada");
    expect(t.text).toContain("linus");
  });

  it("renders no chips for no assignees", () => {
    expect(Template.from(render({ assignees: [] })).has("assignee-chip")).toBe(false);
  });
});
