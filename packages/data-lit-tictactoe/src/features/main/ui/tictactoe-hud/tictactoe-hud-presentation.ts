// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { GameStatus } from "../../data/game-status/game-status.js";
import type { PlayerMark } from "../../data/player-mark/player-mark.js";

export function render(args: {
  status: GameStatus;
  winner: PlayerMark | "cat" | null;
  currentPlayer: PlayerMark;
  xWins: number;
  oWins: number;
  draws: number;
  restartGame: () => void;
}) {
  const { status, winner, currentPlayer, xWins, oWins, draws, restartGame } = args;
  const statusText =
    status === "won" && winner !== null
      ? `${winner} wins!`
      : status === "draw"
        ? "Draw!"
        : `${currentPlayer}'s turn`;
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
