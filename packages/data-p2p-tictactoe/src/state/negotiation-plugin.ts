// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Phase } from "../types/phase/phase.js";
import { createNegotiationService, type NegotiationConfig } from "./negotiation-service.js";

export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "reconnecting";

/**
 * Negotiation-only ECS state — resources + transactions. All resources are
 * `nonPersistent: true` so they are never replicated to peers (the negotiation DB
 * itself is always local-only, but the flag is good documentation).
 *
 * The game role (userId) lives in the synced game DB referenced by the
 * `gameDb` resource. Once the WebRTC handshake completes, the negotiation
 * service constructs that DB, attaches sync transports, and stores the handle
 * here for the container element to render.
 *
 * This is the state surface only; the imperative signaling machine is layered
 * on top by {@link createNegotiationPlugin} as a service + actions.
 */
export const negotiationStatePlugin = Database.Plugin.create({
    resources: {
        phase:       { default: "idle" as Phase,             nonPersistent: true },
        connection:  { default: "idle" as ConnectionState,   nonPersistent: true },
        role:        { default: null as "host" | "joiner" | null, nonPersistent: true },
        sessionId:   { default: null as string | null,        nonPersistent: true },
        offerCode:   { default: "" as string,                 nonPersistent: true },
        answerCode:  { default: "" as string,                 nonPersistent: true },
        bannerText:  { default: "" as string,                 nonPersistent: true },
        bannerError: { default: false as boolean,             nonPersistent: true },
        // Live values of the two paste textareas. Backing them with
        // resources keeps the textareas controlled and avoids touching
        // the DOM from action callbacks.
        hostAnswerInput:   { default: "" as string,  nonPersistent: true },
        joinerOfferInput:  { default: "" as string,  nonPersistent: true },
        // The synced game database, populated by the negotiation service
        // after the WebRTC channel opens. `unknown` so the plugin stays
        // game-agnostic; consumers cast at the render boundary.
        gameDb:      { default: null as unknown, nonPersistent: true },
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
         * Called by the negotiation service after sync transports are wired
         * and the WebRTC channel is open.
         */
        setGameDb(t, { gameDb }: { gameDb: unknown }) {
            t.resources.gameDb = gameDb;
            t.resources.phase = "game";
            t.resources.connection = "connected";
        },
    },
});

/** The negotiation database surface the service writes to. */
export type NegotiationDatabase = Database.Plugin.ToDatabase<typeof negotiationStatePlugin>;

/**
 * The full negotiation plugin: the state surface plus the imperative
 * `negotiation` service and the UI-facing actions that drive it. Each action
 * is a one-line delegation, so a container element calls
 * `service.actions.startHost()` and never touches the full database.
 *
 * Static (not parameterised by game): the plugin — and so the service — is
 * built during `connectedCallback`, before a container's bound props exist,
 * so a container must instead supply the game-specific {@link NegotiationConfig}
 * after mount via `actions.configure(...)`.
 */
export const negotiationPlugin = Database.Plugin.create({
    extends: negotiationStatePlugin,
    services: {
        negotiation: (db) => createNegotiationService(db),
    },
    actions: {
        configure:      (db, config: NegotiationConfig) => db.services.negotiation.configure(config),
        startHost:      (db) => db.services.negotiation.startHost(),
        startJoin:      (db) => db.services.negotiation.startJoin(),
        submitAnswer:   (db) => db.services.negotiation.submitAnswer(),
        generateAnswer: (db) => db.services.negotiation.generateAnswer(),
        reconnect:      (db) => db.services.negotiation.reconnect(),
        dispose:        (db) => db.services.negotiation.dispose(),
    },
});

export type NegotiationPlugin = typeof negotiationPlugin;
