// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, nothing } from "lit";
import type { Entity } from "@adobe/data/ecs";
import "@spectrum-web-components/checkbox/sp-checkbox.js";
import "@spectrum-web-components/action-button/sp-action-button.js";
import "@spectrum-web-components/icons-workflow/icons/sp-icon-delete.js";
import { TODO_ROW_HEIGHT } from "./todo-row.constants.js";
// Lazy wrappers into the assign feature: its chips show a todo's assignees and its
// dropdown edits them. Main never reads assign's data itself.
import { AssigneeChips } from "../../../assign/ui/assignee-chips/assignee-chips.js";
import { AssigneeDropdown } from "../../../assign/ui/assignee-dropdown/assignee-dropdown.js";

type RenderArgs = {
  readonly ready: boolean;
  readonly name: string;
  readonly complete: boolean;
  readonly dragPosition: number | null;
  readonly editing: boolean;
  readonly toggleEditing: () => void;
  readonly index: number;
  readonly entity: Entity;
  readonly toggleComplete: () => void;
  readonly deleteTodo: () => void;
};

export function render(args: RenderArgs) {
  const { ready, name, complete, dragPosition, editing, index, entity } = args;

  if (!ready) return nothing;

  const dragging = dragPosition !== null;
  const top = index * TODO_ROW_HEIGHT + (dragPosition ?? 0);

  return html`
    <div
      class="todo-row ${complete ? "complete" : ""} ${dragging ? "dragging" : ""}"
      style="top: ${top}px;"
    >
      <sp-checkbox
        ?checked=${complete}
        @change=${args.toggleComplete}
        aria-label="Toggle complete"
      ></sp-checkbox>
      <span class="todo-name">${name}</span>
      ${AssigneeChips({ todo: entity })}
      <sp-action-button
        size="s"
        quiet
        ?selected=${editing}
        @click=${args.toggleEditing}
        aria-label="Edit assignees"
      >
        Assign
      </sp-action-button>
      ${editing ? AssigneeDropdown({ todo: entity }) : nothing}
      <sp-action-button
        quiet
        @click=${args.deleteTodo}
        aria-label="Delete todo"
      >
        <sp-icon-delete slot="icon"></sp-icon-delete>
      </sp-action-button>
    </div>
  `;
}
