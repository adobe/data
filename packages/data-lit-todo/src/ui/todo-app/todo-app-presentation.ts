// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";
import { TodoToolbar } from "../todo-toolbar/todo-toolbar.js";
import { TodoList } from "../todo-list/todo-list.js";

export function render() {
  return html`
    ${TodoToolbar()}
    ${TodoList()}
  `;
}
