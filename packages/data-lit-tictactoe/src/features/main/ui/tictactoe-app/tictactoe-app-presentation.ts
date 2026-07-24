// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import { TictactoeBoard } from "../tictactoe-board/tictactoe-board.js";
import { TictactoeHud } from "../tictactoe-hud/tictactoe-hud.js";

export function render() {
    return html`
        ${TictactoeBoard()}
        ${TictactoeHud()}
    `;
}
