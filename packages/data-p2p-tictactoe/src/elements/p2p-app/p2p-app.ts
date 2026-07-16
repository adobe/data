// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Pure composition wrapper for the serverless P2P Tic-Tac-Toe shell. No
// custom element here — the bootstrap is just data: combine the game
// plugin, decide who is X / O, and pass lazy renderers for the game and
// presence overlay to the generic Negotiation container.

import type { TemplateResult } from "lit";
import { Database } from "@adobe/data/ecs";
import { Tictactoe, tictactoePlugin, PlayerMark } from "data-lit-tictactoe";
import { PresenceDatabase } from "../../presence/database/presence-database.js";
import { Negotiation } from "../p2p-negotiation/p2p-negotiation.js";
import { PresenceOverlay } from "../p2p-presence-overlay/p2p-presence-overlay.js";

const gamePlugin = Database.Plugin.combine(tictactoePlugin, PresenceDatabase.plugin);

const assignUserId = (role: "host" | "joiner"): PlayerMark =>
    PlayerMark.values[role === "host" ? 0 : 1];

export const P2pApp = (): TemplateResult => Negotiation({
    gamePlugin,
    assignUserId,
    renderGame:     ({ service }) => Tictactoe({ service }),
    renderPresence: ({ service, children }) => PresenceOverlay({ service, children }),
});
