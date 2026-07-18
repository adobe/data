// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment jsdom
// jsdom only so the Spectrum component imports can load; assertions never touch the DOM.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./users-tab-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  draftName: "",
  setDraftName: () => {},
  addUser: () => {},
  users: [] as readonly { readonly user: string; readonly tasks: readonly string[] }[],
  ...over,
});

describe("users-tab-presentation", () => {
  it("prompts to add a user when there are none", () => {
    const t = Template.from(render(props({ users: [] })));
    expect(t.text).toContain("No users yet");
  });

  it("renders the add-user field wired to addUser", () => {
    const addUser = () => {};
    const t = Template.from(render(props({ addUser })));
    expect(t.has("<sp-textfield")).toBe(true);
    expect(t.values).toContain(addUser);
  });

  it("lists each user with their assigned tasks", () => {
    const t = Template.from(render(props({ users: [{ user: "ada", tasks: ["ship", "review"] }] })));
    expect(t.text).toContain("ada");
    expect(t.text).toContain("ship, review");
  });

  it("shows 'no tasks' for an unassigned user", () => {
    const t = Template.from(render(props({ users: [{ user: "linus", tasks: [] }] })));
    expect(t.text).toContain("no tasks");
  });
});
