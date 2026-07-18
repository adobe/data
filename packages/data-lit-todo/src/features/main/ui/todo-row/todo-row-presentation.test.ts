// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the lazy assignee-dropdown wrapper can load; assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { nothing } from "lit";
import { Template } from "@adobe/data-lit";
import { render } from "./todo-row-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  ready: true,
  name: "Buy milk",
  complete: false,
  dragPosition: null,
  assignees: [] as readonly string[],
  editing: false,
  toggleEditing: () => {},
  index: 0,
  entity: 0,
  toggleComplete: () => {},
  deleteTodo: () => {},
  ...over,
});

describe("todo-row-presentation", () => {
  it("renders nothing until the row's data is ready", () => {
    expect(render(props({ ready: false }))).toBe(nothing);
  });

  it("renders the name and its controls when ready", () => {
    const t = Template.from(render(props({ name: "Water plants" })));
    expect(t.text).toContain("Water plants");
    expect(t.has("<sp-checkbox")).toBe(true);
    expect(t.text).toContain("Assign");
  });

  it("renders a chip per assignee", () => {
    const t = Template.from(render(props({ assignees: ["ada", "linus"] })));
    expect(t.text).toContain("ada");
    expect(t.text).toContain("linus");
  });

  it("wires the complete toggle and delete", () => {
    const toggleComplete = () => {};
    const deleteTodo = () => {};
    const t = Template.from(render(props({ toggleComplete, deleteTodo })));
    expect(t.values).toContain(toggleComplete);
    expect(t.values).toContain(deleteTodo);
  });

  it("mounts the assignee dropdown only while editing", () => {
    expect(Template.from(render(props({ editing: false }))).has("<assignee-dropdown")).toBe(false);
    expect(Template.from(render(props({ editing: true }))).has("<assignee-dropdown")).toBe(true);
  });
});
