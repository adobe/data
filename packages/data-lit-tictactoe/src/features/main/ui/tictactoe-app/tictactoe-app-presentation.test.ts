// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the lazy child-element wrappers (`void import(...)`) can load;
// the assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./tictactoe-app-presentation.js";

describe("tictactoe-app-presentation", () => {
  it("mounts the board and the hud", () => {
    const t = Template.from(render());
    expect(t.has("<tictactoe-board")).toBe(true);
    expect(t.has("<tictactoe-hud")).toBe(true);
  });
});
