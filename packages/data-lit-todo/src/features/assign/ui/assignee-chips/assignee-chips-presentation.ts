// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";

type RenderArgs = {
  readonly assignees: readonly string[];
};

export function render(args: RenderArgs) {
  return html`${args.assignees.map((a) => html`<span class="assignee-chip">${a}</span>`)}`;
}
