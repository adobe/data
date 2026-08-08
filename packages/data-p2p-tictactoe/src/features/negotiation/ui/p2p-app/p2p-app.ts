// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Pure composition wrapper for the serverless P2P Tic-Tac-Toe shell. No custom
// element here — the bootstrap is just data: combine the game plugin with the
// presence peer plugin, decide who is X / O, and pass lazy renderers for the game
// and presence overlay to the generic Negotiation container.

import type { TemplateResult } from "lit";
import { Database } from "@adobe/data/ecs";
import { Tictactoe, TictactoeGameDatabase, PlayerMark } from "data-lit-tictactoe";
import { MainService as PresenceMainService } from "../../../presence/services/main-service/main-service.js";
import { PresenceOverlay } from "../../../presence/ui/p2p-presence-overlay/p2p-presence-overlay.js";
import { Negotiation } from "../p2p-negotiation/p2p-negotiation.js";

const gamePlugin = Database.Plugin.combine(TictactoeGameDatabase.plugin, PresenceMainService.plugin);

const assignUserId = (role: "host" | "joiner"): PlayerMark =>
    PlayerMark.values[role === "host" ? 0 : 1];

export const P2pApp = (): TemplateResult => Negotiation({
    gamePlugin,
    assignUserId,
    renderGame:     ({ service }) => Tictactoe({ service }),
    renderPresence: ({ service, children }) => PresenceOverlay({ service, children }),
});
