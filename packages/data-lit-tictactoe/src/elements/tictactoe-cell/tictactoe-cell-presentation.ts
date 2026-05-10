// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import { PlayerMark } from "../../types/player-mark/player-mark.js";

export function render(args: {
  cell: string;
  isWinning: boolean;
  isPlayable: boolean;
  playMove: () => void;
}) {
  const { cell, isWinning, isPlayable, playMove } = args;
  const hasMark = PlayerMark.is(cell);

  return html`
    <div
      class="cell ${isWinning ? "winning" : ""} ${isPlayable ? "playable" : ""}"
      @click=${() => isPlayable && playMove()}
    >
      ${hasMark ? cell : ""}
    </div>
  `;
}
