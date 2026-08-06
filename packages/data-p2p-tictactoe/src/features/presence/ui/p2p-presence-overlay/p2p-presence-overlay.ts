// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { Database } from "@adobe/data/ecs";
import type { MainService } from "../../services/main-service/main-service.js";

type PresenceService = Database.Plugin.ToDatabase<typeof MainService.plugin>;

/**
 * Generic over `S` so callers may pass a database built from any plugin that
 * extends the presence plugin (e.g. one that combines presence with a game
 * plugin like the tic-tac-toe game database). The element class itself is typed
 * on the minimal presence surface and ignores the extra capabilities.
 */
export const PresenceOverlay = <S extends PresenceService>(args: {
    service: S;
    children: TemplateResult;
}): TemplateResult => {
    void import("./p2p-presence-overlay-element.js");
    return html`<p2p-presence-overlay .service=${args.service}>${args.children}</p2p-presence-overlay>`;
};
