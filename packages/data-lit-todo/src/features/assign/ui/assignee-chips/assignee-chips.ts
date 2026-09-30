// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";
import type { Entity } from "@adobe/data/ecs";

// Lazy wrapper — main's todo-row renders a todo's assignees through this, so main
// never reads assign's `assignees` component itself.
export const AssigneeChips = (args: { todo: Entity }): TemplateResult => {
  void import("./assignee-chips-element.js");
  return html`<assignee-chips .todo=${args.todo}></assignee-chips>`;
};
