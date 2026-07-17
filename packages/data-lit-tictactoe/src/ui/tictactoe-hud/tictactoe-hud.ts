// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";

export const TictactoeHud = (): TemplateResult => {
    void import("./tictactoe-hud-element.js");
    return html`<tictactoe-hud></tictactoe-hud>`;
};
