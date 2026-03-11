// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";

export function render(args: {
  statusText: string;
  restartGame: () => void;
}) {
  const { statusText, restartGame } = args;
  return html`
    <div class="hud">
      <span>${statusText}</span>
      <button type="button" @click=${restartGame}>Restart</button>
    </div>
  `;
}
