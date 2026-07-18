// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html } from "lit";
import "@spectrum-web-components/checkbox/sp-checkbox.js";

export function render(args: {
  readonly users: readonly { readonly name: string; readonly assigned: boolean }[];
  readonly toggleAssignee: (name: string) => void;
}) {
  const { users, toggleAssignee } = args;
  return html`
    <div class="panel">
      ${users.length === 0
        ? html`<div class="empty">No users yet — add some in the Users tab.</div>`
        : users.map(
            (u) => html`
              <sp-checkbox
                size="s"
                ?checked=${u.assigned}
                @change=${() => toggleAssignee(u.name)}
                >${u.name}</sp-checkbox
              >
            `,
          )}
    </div>
  `;
}
