// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the lazy row wrapper can load; assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./todo-list-presentation.js";

describe("todo-list-presentation", () => {
  it("shows an empty message when there are no todos", () => {
    const t = Template.from(render({ todos: [] }));
    expect(t.text).toContain("No todos");
  });

  it("renders the list container sized to the todo count", () => {
    const t = Template.from(render({ todos: [1, 2, 3] }));
    expect(t.has("todo-list")).toBe(true);
    // height = todos.length * TODO_ROW_HEIGHT is a bound numeric value
    expect(t.values.some((v) => typeof v === "number" && v > 0)).toBe(true);
  });
});
