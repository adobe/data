// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the lazy child-element wrappers can load; assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./todo-app-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  tab: "todos" as const,
  setTab: () => {},
  ...over,
});

describe("todo-app-presentation", () => {
  it("offers both tabs", () => {
    const t = Template.from(render(props()));
    expect(t.text).toContain("Todos");
    expect(t.text).toContain("Users");
  });

  it("shows the toolbar and list on the todos tab", () => {
    const t = Template.from(render(props({ tab: "todos" })));
    expect(t.has("<todo-toolbar")).toBe(true);
    expect(t.has("<todo-list")).toBe(true);
    expect(t.has("<users-tab")).toBe(false);
  });

  it("shows the users tab content on the users tab", () => {
    const t = Template.from(render(props({ tab: "users" })));
    expect(t.has("<users-tab")).toBe(true);
    expect(t.has("<todo-list")).toBe(false);
  });

  it("wires both tab switches", () => {
    const calls: string[] = [];
    const t = Template.from(render(props({ setTab: (tab) => calls.push(tab) })));
    t.values.filter((v): v is () => void => typeof v === "function").forEach((fn) => fn());
    expect(calls).toContain("todos");
    expect(calls).toContain("users");
  });
});
