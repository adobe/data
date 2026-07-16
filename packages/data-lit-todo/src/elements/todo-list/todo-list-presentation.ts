// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Entity } from "@adobe/data/ecs";
import { TodoRow } from "../todo-row/todo-row.js";
import { TODO_ROW_HEIGHT } from "../todo-row/todo-row.constants.js";

type RenderArgs = {
  readonly todos: readonly Entity[];
};

export function render(args: RenderArgs) {
  if (args.todos.length === 0) {
    return html`<div class="empty">No todos to show.</div>`;
  }

  return html`
    <div
      class="todo-list"
      style="height: ${args.todos.length * TODO_ROW_HEIGHT}px;"
    >
      ${repeat(
        args.todos,
        (entity) => entity,
        (entity, index) => TodoRow({ entity, index }),
      )}
    </div>
  `;
}
