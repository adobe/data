// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";
import type { AsyncArgsProvider, Entity } from "@adobe/data/ecs";
import { useDragTransaction } from "@adobe/data-lit";
import "@spectrum-web-components/checkbox/sp-checkbox.js";
import "@spectrum-web-components/action-button/sp-action-button.js";
import "@spectrum-web-components/icons-workflow/icons/sp-icon-delete.js";
import type { DragTodoInput } from "../../database/transactions/drag-todo.js";
import { TODO_ROW_HEIGHT } from "./todo-row.constants.js";

type RenderArgs = {
  readonly ready: boolean;
  readonly name: string;
  readonly complete: boolean;
  readonly dragPosition: number | null;
  readonly index: number;
  readonly entity: Entity;
  readonly dragTodo: (asyncArgs: AsyncArgsProvider<DragTodoInput>) => void;
  readonly toggleComplete: () => void;
  readonly deleteTodo: () => void;
};

export function render(args: RenderArgs) {
  const { ready, name, complete, dragPosition, index, entity } = args;

  // Hooks must run on every render, so dragging is wired before the ready guard.
  // A single coalesced transaction spans the whole gesture: `move` frames record
  // the live pixel offset, and the `end` frame commits the reorder.
  useDragTransaction<DragTodoInput>(
    {
      transaction: args.dragTodo,
      update: (value) => {
        if (value.type === "move") {
          return { entity, dragPosition: value.delta[1] };
        }
        if (value.type === "end") {
          return {
            entity,
            dragPosition: value.delta[1],
            finalIndex: index + Math.round(value.delta[1] / TODO_ROW_HEIGHT),
          };
        }
      },
    },
    [args.dragTodo, entity, index],
  );

  if (!ready) return;

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
