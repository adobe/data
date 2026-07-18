// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";
import "@spectrum-web-components/textfield/sp-textfield.js";
import "@spectrum-web-components/button/sp-button.js";

export function render(args: {
  readonly draftName: string;
  readonly setDraftName: (value: string) => void;
  readonly addUser: () => void;
  readonly users: readonly { readonly user: string; readonly tasks: readonly string[] }[];
}) {
  const { draftName, setDraftName, addUser, users } = args;
  return html`
    <div class="users-tab">
      <div class="add-row">
        <sp-textfield
          class="add-input"
          placeholder="New user name"
          aria-label="New user name"
          .value=${draftName}
          @input=${(e: Event) => setDraftName((e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") addUser();
          }}
        ></sp-textfield>
        <sp-button variant="accent" @click=${addUser} ?disabled=${draftName.trim() === ""}>
          Add user
        </sp-button>
      </div>

      ${users.length === 0
        ? html`<div class="empty">No users yet. Add one above.</div>`
        : html`
            <ul class="user-list">
              ${users.map(
                (u) => html`
                  <li class="user">
                    <span class="user-name">${u.user}</span>
                    <span class="tasks">
                      ${u.tasks.length === 0
                        ? html`<span class="none">no tasks</span>`
                        : u.tasks.join(", ")}
                    </span>
                  </li>
                `,
              )}
            </ul>
          `}
    </div>
  `;
}
