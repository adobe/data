// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the Spectrum component imports can load; assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./todo-toolbar-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  draftName: "",
  totalCount: 0,
  completedCount: 0,
  displayCompleted: false,
  setDraftName: () => {},
  addTodo: () => {},
  addRandomTodo: () => {},
  addBulkTodos: () => {},
  toggleDisplayCompleted: () => {},
  clearAll: () => {},
  ...over,
});

describe("todo-toolbar-presentation", () => {
  it("renders the new-todo input and controls", () => {
    const t = Template.from(render(props()));
    expect(t.has("<sp-textfield")).toBe(true);
    expect(t.text).toContain("Add");
  });

  it("shows the completed / total stats", () => {
    const t = Template.from(render(props({ totalCount: 3, completedCount: 1 })));
    expect(t.text).toContain("1 / 3 completed");
  });

  it("wires the discrete toolbar actions", () => {
    const addRandomTodo = () => {};
    const toggleDisplayCompleted = () => {};
    const clearAll = () => {};
    const t = Template.from(render(props({ addRandomTodo, toggleDisplayCompleted, clearAll })));
    expect(t.values).toContain(addRandomTodo);
    expect(t.values).toContain(toggleDisplayCompleted);
    expect(t.values).toContain(clearAll);
  });

  it("disables Add and Clear when there is nothing to act on", () => {
    const t = Template.from(render(props({ draftName: "   ", totalCount: 0 })));
    // ?disabled=${draftName.trim() === ""} and ?disabled=${totalCount === 0}
    expect(t.values).toContain(true);
  });
});
