// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";

// Lazy wrapper for the Users tab — main's app renders this when the tab is
// first opened, lazily loading the feature and extending the shared database.
export const UsersTab = (): TemplateResult => {
  void import("./users-tab-element.js");
  return html`<users-tab></users-tab>`;
};
