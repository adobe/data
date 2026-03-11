// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";

export function render(args: {
  cell: string;
  isWinning: boolean;
  isPlayable: boolean;
  playMove: () => void;
}) {
  const { cell, isWinning, isPlayable, playMove } = args;
  const hasMark = cell === "X" || cell === "O";

  return html`
    <div
      class="cell ${isWinning ? "winning" : ""} ${isPlayable ? "playable" : ""}"
      @click=${() => isPlayable && playMove()}
    >
      ${hasMark ? cell : ""}
    </div>
  `;
}
