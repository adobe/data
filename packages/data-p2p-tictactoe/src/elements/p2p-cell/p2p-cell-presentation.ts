// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { Cell } from "../../state/p2p-plugin.js";

export function render(args: {
    cell: Cell;
    isWinning: boolean;
    isPlayable: boolean;
    playMove: () => void;
}) {
    const { cell, isWinning, isPlayable, playMove } = args;
    const hasMark = cell === "X" || cell === "O";
    const mark = hasMark ? cell.toLowerCase() : "";

    return html`
        <div
            class="cell ${mark ? `cell--${mark}` : ""} ${isWinning ? "cell--winning" : ""} ${isPlayable ? "cell--playable" : ""}"
            @click=${() => isPlayable && playMove()}
            role="button"
            aria-label=${hasMark ? cell : "Empty cell"}
            aria-disabled=${!isPlayable}
        >
            ${hasMark ? cell : ""}
        </div>
    `;
}
