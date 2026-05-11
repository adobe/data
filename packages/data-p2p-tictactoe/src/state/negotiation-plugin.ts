// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Phase } from "../types/phase/phase.js";

export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "reconnecting";

/**
 * Negotiation-only ECS plugin. All resources are `ephemeral: true` so they
 * are never replicated to peers (the negotiation DB itself is always
 * local-only, but the ephemeral flag is good documentation).
 *
 * The game role (userId) lives in the synced game DB referenced by the
 * `gameDb` resource. Once the WebRTC handshake completes, the negotiation
 * controller constructs that DB, attaches sync transports, and stores the
 * handle here for the container element to render.
 */
export const negotiationPlugin = Database.Plugin.create({
    resources: {
        phase:       { default: "idle" as Phase,             ephemeral: true },
        connection:  { default: "idle" as ConnectionState,   ephemeral: true },
        role:        { default: null as "host" | "joiner" | null, ephemeral: true },
        sessionId:   { default: null as string | null,        ephemeral: true },
        offerCode:   { default: "" as string,                 ephemeral: true },
        answerCode:  { default: "" as string,                 ephemeral: true },
        bannerText:  { default: "" as string,                 ephemeral: true },
        bannerError: { default: false as boolean,             ephemeral: true },
        // Live values of the two paste textareas. Backing them with
        // resources keeps the textareas controlled and avoids touching
        // the DOM from action callbacks.
        hostAnswerInput:   { default: "" as string,  ephemeral: true },
        joinerOfferInput:  { default: "" as string,  ephemeral: true },
        // The synced game database, populated by the negotiation controller
        // after the WebRTC channel opens. `unknown` so the plugin stays
        // game-agnostic; consumers cast at the render boundary.
        gameDb:      { default: null as unknown, ephemeral: true },
    },
    transactions: {
        startHostSignaling(t) {
            t.resources.phase = "host-signaling";
            t.resources.role = "host";
            t.resources.connection = "connecting";
            t.resources.bannerText = "Generating invite code — please wait…";
            t.resources.bannerError = false;
        },
        startJoinSignaling(t) {
            t.resources.phase = "join-signaling";
            t.resources.role = "joiner";
            t.resources.connection = "connecting";
            t.resources.bannerText = "";
            t.resources.bannerError = false;
        },
        setOfferCode(t, { code }: { code: string }) {
            t.resources.offerCode = code;
            t.resources.bannerText = "";
        },
        setAnswerCode(t, { code }: { code: string }) {
            t.resources.answerCode = code;
            t.resources.bannerText = "";
        },
        setBanner(t, { text, error = false }: { text: string; error?: boolean }) {
            t.resources.bannerText = text;
            t.resources.bannerError = error;
        },
        setHostAnswerInput(t, { value }: { value: string }) {
            t.resources.hostAnswerInput = value;
        },
        setJoinerOfferInput(t, { value }: { value: string }) {
            t.resources.joinerOfferInput = value;
        },
        setConnection(t, { state, sessionId }: { state: ConnectionState; sessionId?: string | null }) {
            t.resources.connection = state;
            if (sessionId !== undefined) t.resources.sessionId = sessionId;
        },
        /**
         * Stores the constructed game DB and transitions to the game phase.
         * Called by the negotiation controller after sync transports are
         * wired and the WebRTC channel is open.
         */
        setGameDb(t, { gameDb }: { gameDb: unknown }) {
            t.resources.gameDb = gameDb;
            t.resources.phase = "game";
            t.resources.connection = "connected";
        },
    },
});
