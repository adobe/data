// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import { TictactoeCell } from "../tictactoe-cell/tictactoe-cell.js";

export function render() {
    return html`
        <div class="board">
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => TictactoeCell({ index }))}
        </div>
    `;
}
