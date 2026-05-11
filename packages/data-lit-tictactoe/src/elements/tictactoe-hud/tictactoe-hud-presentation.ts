// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";

export function render(args: {
  statusText: string;
  xWins: number;
  oWins: number;
  draws: number;
  restartGame: () => void;
}) {
  const { statusText, xWins, oWins, draws, restartGame } = args;
  return html`
    <div class="hud">
      <div class="score">
        <span class="score-cell score-x">X <strong>${xWins}</strong></span>
        <span class="score-cell score-draw">= <strong>${draws}</strong></span>
        <span class="score-cell score-o">O <strong>${oWins}</strong></span>
      </div>
      <span class="status">${statusText}</span>
      <button type="button" @click=${restartGame}>Restart</button>
    </div>
  `;
}
