// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import { Database } from "@adobe/data/ecs";
import { MainService } from "../../ecs/main-service.js";
import type { GameService } from "../../services/game-service/game-service.js";
import type { RenderGame, RenderPresence } from "./p2p-negotiation-presentation.js";

/**
 * Mounts the negotiation for `game`: builds the negotiation database with `game`
 * injected and binds it to the element. Render it once per session — each call
 * builds a fresh database.
 *
 * Generic over the game plugin `P` so `renderGame` / `renderPresence` receive a
 * fully typed `service`. The element stores the game database as `unknown` (the
 * negotiation plugin is game-agnostic), so the typed callbacks are adapted here.
 * The cast holds by construction: the `connection` service builds the game
 * database from `game.plugin`, which is this `P`.
 */
export const Negotiation = <P extends Database.Plugin>(args: {
    game: GameService<P>;
    renderGame: (args: { service: Database.Plugin.ToDatabase<P> }) => TemplateResult;
    renderPresence?: (args: { service: Database.Plugin.ToDatabase<P>; children: TemplateResult }) => TemplateResult;
}): TemplateResult => {
    void import("./p2p-negotiation-element.js");

    const service = Database.create(MainService.plugin, { services: { game: args.game } });

    type GameDb = Database.Plugin.ToDatabase<P>;
    const renderGame: RenderGame = ({ service }) =>
        args.renderGame({ service: service as GameDb });
    const renderPresence: RenderPresence | undefined = args.renderPresence
        && (({ service, children }) =>
            args.renderPresence!({ service: service as GameDb, children }));

    return html`
        <p2p-negotiation
            .service=${service}
            .renderGame=${renderGame}
            .renderPresence=${renderPresence}
        ></p2p-negotiation>
    `;
};
