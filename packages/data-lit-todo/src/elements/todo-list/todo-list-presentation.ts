// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import '@spectrum-web-components/action-button/sp-action-button.js';
import '../todo-row/todo-row.js';

type RenderArgs = {
  todos: readonly Entity[];
};

export function render(args: RenderArgs) {
  return html`
    <div class="todo-list">
      ${repeat(
    args.todos,
    todo => todo,
    (todo, index) => html` <data-todo-row .entity=${todo} .index=${index}></data-todo-row> `
  )}
    </div>
  `;
}
