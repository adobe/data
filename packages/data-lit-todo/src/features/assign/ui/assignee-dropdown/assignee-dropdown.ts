// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";
import type { Entity } from "@adobe/data/ecs";

// Lazy wrapper — the only import main's todo-row makes into the assign feature.
// The heavy element (and, through it, the feature's service database) loads on
// first render; connecting the element extends the shared DB with the feature.
export const AssigneeDropdown = (args: { todo: Entity }): TemplateResult => {
  void import("./assignee-dropdown-element.js");
  return html`<assignee-dropdown .todo=${args.todo}></assignee-dropdown>`;
};
