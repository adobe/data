// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { ComputedDatabase } from "../../ecs/computed-database.js";

type TictactoeService = ComputedDatabase;

/**
 * Generic over `S` so callers may pass a database built from any plugin
 * that extends the base game database (for example one that adds AI agents
 * or peer presence). The element class itself is typed on the minimal
 * `ComputedDatabase` surface and ignores the extra capabilities.
 */
export const Tictactoe = <S extends TictactoeService>(args: { service: S }): TemplateResult => {
    void import("./tictactoe-app-element.js");
    return html`<tictactoe-app .database=${args.service}></tictactoe-app>`;
};
