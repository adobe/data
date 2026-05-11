// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { Database } from "@adobe/data/ecs";
import type { tictactoePlugin } from "../../state/tictactoe-plugin.js";

type TictactoeService = Database.Plugin.ToDatabase<typeof tictactoePlugin>;

/**
 * Generic over `S` so callers may pass a database built from any plugin
 * that extends `tictactoePlugin` (for example one that adds AI agents
 * or peer presence). The element class itself is typed on the minimal
 * `tictactoePlugin` surface and ignores the extra capabilities.
 */
export const Tictactoe = <S extends TictactoeService>(args: { service: S }): TemplateResult => {
    void import("./tictactoe-app-element.js");
    return html`<tictactoe-app .service=${args.service}></tictactoe-app>`;
};
