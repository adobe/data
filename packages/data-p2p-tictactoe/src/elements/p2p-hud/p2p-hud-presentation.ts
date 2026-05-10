// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { PlayerMark } from "../../types/player-mark/player-mark.js";

export function render(args: {
    myMark: PlayerMark;
    statusText: string;
    myTurn: boolean;
    isOver: boolean;
    restartGame: () => void;
}) {
    const { myMark, statusText, myTurn, isOver, restartGame } = args;
    return html`
        <div class="status-row">
            <span class="badge">You are ${myMark}</span>
            <span class="status ${myTurn ? "status--active" : ""}">${statusText}</span>
        </div>
        ${isOver
            ? html`<button type="button" class="btn-restart" @click=${restartGame}>
                  Play again
              </button>`
            : ""}
    `;
}
