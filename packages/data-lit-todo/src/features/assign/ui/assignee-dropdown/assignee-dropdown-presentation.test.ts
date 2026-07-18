// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the Spectrum checkbox import can load; assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./assignee-dropdown-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  users: [] as readonly { readonly name: string; readonly assigned: boolean }[],
  toggleAssignee: () => {},
  ...over,
});

describe("assignee-dropdown-presentation", () => {
  it("prompts to add users when there are none", () => {
    const t = Template.from(render(props({ users: [] })));
    expect(t.text).toContain("No users yet");
  });

  it("lists users as checkboxes reflecting current assignment", () => {
    const t = Template.from(
      render(props({ users: [{ name: "ada", assigned: true }, { name: "linus", assigned: false }] })),
    );
    expect(t.has("<sp-checkbox")).toBe(true);
    expect(t.text).toContain("ada");
    expect(t.text).toContain("linus");
    expect(t.values).toContain(true); // ?checked=${u.assigned}
  });

  it("toggles a user when its checkbox changes", () => {
    const toggled: string[] = [];
    const t = Template.from(
      render(props({ users: [{ name: "ada", assigned: false }], toggleAssignee: (n) => toggled.push(n) })),
    );
    t.values.filter((v): v is () => void => typeof v === "function").forEach((fn) => fn());
    expect(toggled).toContain("ada");
  });
});
