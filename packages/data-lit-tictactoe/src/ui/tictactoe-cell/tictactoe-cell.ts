// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";

export const TictactoeCell = (args: { index: number }): TemplateResult => {
    void import("./tictactoe-cell-element.js");
    return html`<tictactoe-cell .index=${args.index}></tictactoe-cell>`;
};
