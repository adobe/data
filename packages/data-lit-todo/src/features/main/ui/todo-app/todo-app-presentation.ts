// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";
import "@spectrum-web-components/action-button/sp-action-button.js";
import { TodoToolbar } from "../todo-toolbar/todo-toolbar.js";
import { TodoList } from "../todo-list/todo-list.js";
// Lazy wrapper into the assign feature — the Users tab loads (and extends the
// shared database) only when it is first opened.
import { UsersTab } from "../../../assign/ui/users-tab/users-tab.js";

export function render(args: {
  readonly tab: "todos" | "users";
  readonly setTab: (tab: "todos" | "users") => void;
}) {
  const { tab, setTab } = args;
  return html`
    <div class="tabs">
      <sp-action-button
        quiet
        ?selected=${tab === "todos"}
        @click=${() => setTab("todos")}
        >Todos</sp-action-button
      >
      <sp-action-button
        quiet
        ?selected=${tab === "users"}
        @click=${() => setTab("users")}
        >Users</sp-action-button
      >
    </div>
    ${tab === "todos" ? html`${TodoToolbar()} ${TodoList()}` : UsersTab()}
  `;
}
