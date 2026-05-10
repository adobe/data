// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";

export const TictactoeBoard = (): TemplateResult => {
    void import("./tictactoe-board-element.js");
    return html`<tictactoe-board></tictactoe-board>`;
};
