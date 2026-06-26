// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { Database } from "@adobe/data/ecs";
import type { RenderGame, RenderPresence } from "./p2p-negotiation-presentation.js";

/**
 * Generic over `P` (the game plugin) so callers' `renderGame` and
 * `renderPresence` callbacks receive a fully-typed `service` argument
 * matching the plugin they passed in. The element internally stores the
 * game database as `unknown` (the negotiation plugin is monomorphic), so
 * we adapt the typed callbacks at this boundary. The cast is justified:
 * the negotiation service constructs the game database from `args.gamePlugin`,
 * so by construction the value stored in the `gameDb` resource is a
 * `Database.Plugin.ToDatabase<P>`.
 */
export const Negotiation = <P extends Database.Plugin>(args: {
    gamePlugin: P;
    assignUserId: (role: "host" | "joiner") => string;
    renderGame: (args: { service: Database.Plugin.ToDatabase<P> }) => TemplateResult;
    renderPresence?: (args: { service: Database.Plugin.ToDatabase<P>; children: TemplateResult }) => TemplateResult;
}): TemplateResult => {
    void import("./p2p-negotiation-element.js");

    type GameDb = Database.Plugin.ToDatabase<P>;
    const renderGame: RenderGame = ({ service }) =>
        args.renderGame({ service: service as GameDb });
    const renderPresence: RenderPresence | undefined = args.renderPresence
        && (({ service, children }) =>
            args.renderPresence!({ service: service as GameDb, children }));

    return html`
        <p2p-negotiation
            .gamePlugin=${args.gamePlugin}
            .assignUserId=${args.assignUserId}
            .renderGame=${renderGame}
            .renderPresence=${renderPresence}
        ></p2p-negotiation>
    `;
};
