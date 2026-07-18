// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the lazy cell wrapper (`void import(...)`) can load; the
// assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./tictactoe-board-presentation.js";

describe("tictactoe-board-presentation", () => {
  it("renders a 3x3 board of nine cells", () => {
    const t = Template.from(render());
    expect(t.has("board")).toBe(true);
    expect(t.has("<tictactoe-cell")).toBe(true);
    expect(t.children).toHaveLength(9);
  });
});
