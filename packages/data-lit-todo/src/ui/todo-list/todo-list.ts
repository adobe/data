// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";

export const TodoList = (): TemplateResult => {
  void import("./todo-list-element.js");
  return html`<todo-list></todo-list>`;
};
