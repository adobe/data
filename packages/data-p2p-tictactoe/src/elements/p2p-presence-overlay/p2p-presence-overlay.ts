// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { PresenceDatabase } from "../../presence/database/presence-database.js";

type PresenceService = PresenceDatabase;

/**
 * Generic over `S` so callers may pass a database built from any plugin
 * that extends the presence plugin (e.g. one that combines presence with a
 * game plugin like `TictactoeGameDatabase.plugin`). The element class itself is typed
 * on the minimal `PresenceDatabase` surface and ignores the extra
 * capabilities.
 */
export const PresenceOverlay = <S extends PresenceService>(args: {
    service: S;
    children: TemplateResult;
}): TemplateResult => {
    void import("./p2p-presence-overlay-element.js");
    return html`<p2p-presence-overlay .service=${args.service}>${args.children}</p2p-presence-overlay>`;
};
