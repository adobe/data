// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";

export const TodoToolbar = (): TemplateResult => {
  void import("./todo-toolbar-element.js");
  return html`<todo-toolbar></todo-toolbar>`;
};
